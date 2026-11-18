"""串行处理 3D 队列；失败即停，已有任务仅查询，结果下载可单独重试。"""
import argparse
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request


RUNNING = {"SUBMITTED", "WAIT", "RUN", "QUEUED", "PROCESSING"}


def save_state(path, state):
    # 原子替换，避免写入中断破坏已有成功记录。
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf8", dir=path.parent,
                                     prefix=".jobs-", delete=False) as handle:
        temporary = Path(handle.name)
        try:
            json.dump(state, handle, ensure_ascii=False, indent=1)
        except BaseException:
            handle.close()
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def call(script, args, timeout):
    token = os.environ.get("MODEL_GENERATION_TOKEN", "").strip()
    if not token:
        return {}, "MISSING_MODEL_GENERATION_TOKEN"
    try:
        process = subprocess.run(
            [sys.executable, str(script), *args, "--token", token],
            stdin=subprocess.DEVNULL, capture_output=True, text=True,
            encoding="utf8", errors="replace", timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {}, "OFFICIAL_SCRIPT_TIMEOUT"
    except OSError:
        return {}, "OFFICIAL_SCRIPT_START_FAILED"
    try:
        result = json.loads(process.stdout[process.stdout.index("{"):])
        if not isinstance(result, dict):
            return {}, "INVALID_JSON_RESPONSE"
    except (ValueError, TypeError):
        return {}, "INVALID_JSON_RESPONSE"
    # 不保存或打印原始 stdout、stderr、远端错误文案或异常，避免泄露凭据。
    http_status = result.get("http_status")
    if type(http_status) is int and 400 <= http_status <= 599:
        return result, f"HTTP_{http_status}"
    if result.get("error"):
        return result, "OFFICIAL_SCRIPT_REJECTED"
    if process.returncode:
        return result, "OFFICIAL_SCRIPT_NONZERO_EXIT"
    return result, None


def valid_name(name):
    return isinstance(name, str) and bool(name.strip()) and name not in (".", "..") and not any(
        character in name for character in '/\\:*?"<>|'
    ) and not name.endswith((" ", "."))


def download(base, name, files):
    if not valid_name(name) or not isinstance(files, list) or not files:
        raise ValueError("INVALID_DOWNLOAD_RESULT")
    directory = base / "raw" / name
    directory.mkdir(parents=True, exist_ok=True)
    for index, item in enumerate(files):
        url = item.get("Url") or item.get("url")
        kind = str(item.get("Type") or "file").lower()
        if not re.fullmatch(r"[a-z0-9_-]+", kind):
            raise ValueError("INVALID_FILE_TYPE")
        extension = Path(urllib.parse.urlsplit(url).path).suffix
        if not re.fullmatch(r"\.[a-zA-Z0-9]+", extension):
            extension = ".bin"
        targets = [(url, directory / f"{kind}_{index}{extension}")]
        if item.get("PreviewImageUrl"):
            targets.append((item["PreviewImageUrl"], directory / f"preview_{index}.png"))
        for source, target in targets:
            if not isinstance(source, str) or urllib.parse.urlsplit(source).scheme not in ("http", "https"):
                raise ValueError("INVALID_DOWNLOAD_URL")
            if target.exists():
                continue
            with tempfile.NamedTemporaryFile(dir=directory, suffix=".part", delete=False) as handle:
                temporary = Path(handle.name)
            try:
                urllib.request.urlretrieve(source, temporary)
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)


def run_queue(script, base, state, prompts, timeout, poll_interval, download_only=False):
    deadline = time.monotonic() + timeout

    def save():
        save_state(base / "jobs.json", state)

    def fail(entry, status, error):
        entry.update(status=status, error=error)
        save()
        print(f"队列停止：{status} / {error}", file=sys.stderr)
        return 1

    def finish_download(entry, name):
        try:
            download(base, name, entry["files"])
        except Exception:
            return fail(entry, "DOWNLOAD_FAIL", "DOWNLOAD_FAILED_USE_SAVED_FILES")
        entry["status"] = "DONE"
        entry.pop("error", None)
        save()
        return 0

    def poll(entry, name):
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return fail(entry, "POLL_TIMEOUT", "TOTAL_TIMEOUT")
            result, error = call(script, ["status", entry["job_id"], "--type", "3d"], min(120, remaining))
            if error:
                return fail(entry, "QUERY_ERROR", error)
            status = result.get("status")
            if status == "DONE":
                raw = result.get("raw_result")
                files = raw.get("ResultFile3Ds") if isinstance(raw, dict) else None
                if not isinstance(files, list) or not files or not all(isinstance(item, dict) for item in files):
                    return fail(entry, "QUERY_ERROR", "MISSING_RESULT_FILES")
                # 先保存成功结果，再下载；下载失败和重启均不得重新生成。
                entry.update(status="DOWNLOAD_PENDING", generation_status="DONE", files=[
                    {key: item[key] for key in ("Url", "url", "Type", "PreviewImageUrl") if key in item}
                    for item in files
                ])
                entry.pop("error", None)
                save()
                return finish_download(entry, name)
            if status in ("FAIL", "FAILED"):
                return fail(entry, "FAIL", "REMOTE_JOB_FAILED")
            if not isinstance(status, str) or status not in RUNNING:
                return fail(entry, "QUERY_ERROR", "UNEXPECTED_JOB_STATUS")
            entry["status"] = status
            entry.pop("error", None)
            save()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return fail(entry, "POLL_TIMEOUT", "TOTAL_TIMEOUT")
            time.sleep(min(poll_interval, remaining))

    # 缓存结果优先，DONE 完全不动；下载模式不调用官方脚本，也不提交新任务。
    for name, entry in state.items():
        if entry.get("status") != "DONE" and entry.get("files"):
            if finish_download(entry, name):
                return 1
    if download_only:
        return 0

    for name, entry in state.items():
        if entry.get("status") in ("DONE", "FAIL", "FAILED"):
            continue
        if entry.get("job_id") and poll(entry, name):
            return 1
    for entry in state.values():
        if entry.get("status") != "DONE":
            # 包括旧 RETRY、无 job_id 的失败或中断提交，重启也不自动重提。
            print("队列停止：存在未完成的失败或不确定记录；请人工核对，不自动重提。", file=sys.stderr)
            return 1

    for name, prompt in prompts:
        if name in state:
            continue
        entry = state[name] = {"status": "SUBMITTING"}
        save()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return fail(entry, "SUBMIT_FAILED", "TOTAL_TIMEOUT_BEFORE_SUBMIT")
        result, error = call(script, ["3d", prompt, "--enable-pbr", "--face-count", "60000", "--no-poll"], min(120, remaining))
        job_id = result.get("job_id")
        if isinstance(job_id, str) and job_id.strip():
            entry["job_id"] = job_id
        if error or not entry.get("job_id") or result.get("status") in ("FAIL", "FAILED"):
            return fail(entry, "SUBMIT_FAILED", error or "SUBMISSION_NOT_CONFIRMED")
        entry["status"] = "SUBMITTED"
        save()
        if poll(entry, name):
            return 1
    print("队列完成。")
    return 0


def positive_seconds(value):
    try:
        number = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError("必须提供正数秒数") from None
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("必须提供有限的正数秒数")
    return number


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--script", type=Path, help="当前已安装的官方生成脚本路径；非下载模式必填")
    parser.add_argument("--timeout", type=positive_seconds, default=600, help="本次运行提交和轮询的总超时秒数（默认 600）")
    parser.add_argument("--poll-interval", type=positive_seconds, default=15, help="仅正常等待状态的查询间隔秒数（默认 15）")
    parser.add_argument("--download-only", action="store_true", help="仅重试已保存结果的下载，不查状态、不生成，无需凭据")
    args = parser.parse_args(argv)
    if not args.download_only:
        if args.script is None or not args.script.is_file():
            parser.error("请通过 --script 提供当前已安装的官方生成脚本文件路径")
        if not os.environ.get("MODEL_GENERATION_TOKEN", "").strip():
            parser.error("缺少环境变量 MODEL_GENERATION_TOKEN；不会读取凭据文件")
    base = Path(__file__).resolve().parent
    try:
        path = base / "jobs.json"
        state = json.loads(path.read_text(encoding="utf8")) if path.exists() else {}
        if not isinstance(state, dict) or not all(valid_name(name) and isinstance(entry, dict) for name, entry in state.items()):
            raise ValueError("INVALID_STATE")
        prompts = []
        if not args.download_only:
            for line in (base / "prompts.tsv").read_text(encoding="utf8").splitlines():
                if not line.strip():
                    continue
                fields = line.split("\t", 1)
                if len(fields) != 2 or not valid_name(fields[0]) or not fields[1].strip():
                    raise ValueError("INVALID_PROMPT")
                prompts.append(fields)
    except (OSError, ValueError):
        parser.error("无法读取队列：请检查脚本目录的 jobs.json 格式及 prompts.tsv（名称<TAB>提示词）")
    try:
        return run_queue(args.script, base, state, prompts, args.timeout, args.poll_interval, args.download_only)
    except OSError:
        print("队列停止：本地状态保存失败；不会继续提交。", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("队列已中止；不自动重试提交。", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
