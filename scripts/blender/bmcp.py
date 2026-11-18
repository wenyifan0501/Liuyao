"""Minimal client for the Blender MCP add-on socket (default 127.0.0.1:9876).

The add-on accepts one JSON object {"type": ..., "params": {...}} per request and
answers with {"status": "success"|"error", ...}. This is the same protocol the
blender-mcp server uses, so no separate MCP process is needed.

Usage:
  python bmcp.py ping
  python bmcp.py scene
  python bmcp.py run <script.py> [--arg key=value ...]   # exec a bpy script inside Blender
  python bmcp.py shot <out.png> [max_size]                # viewport screenshot
"""
import json
import socket
import sys
from pathlib import Path

HOST, PORT = "127.0.0.1", 9876


def send(command, timeout=600):
    with socket.create_connection((HOST, PORT), timeout=10) as s:
        s.settimeout(timeout)
        s.sendall(json.dumps(command).encode("utf-8"))
        buffer = b""
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            buffer += chunk
            try:
                return json.loads(buffer.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
    raise RuntimeError("Blender closed the connection without a complete reply")


def run_script(path, args):
    source = Path(path).read_text(encoding="utf-8")
    # Arguments are injected as a plain dict; the script reads ARGS.get(...).
    prelude = f"ARGS = {json.dumps(args)}\n__file__ = {json.dumps(str(Path(path).resolve()))}\n"
    return send({"type": "execute_code", "params": {"code": prelude + source}})


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd = argv[0]
    if cmd == "ping":
        reply = send({"type": "ping"}, timeout=10)
    elif cmd == "scene":
        reply = send({"type": "get_scene_info"})
    elif cmd == "run":
        args = dict(a.split("=", 1) for a in argv[2:] if "=" in a)
        reply = run_script(argv[1], args)
    elif cmd == "shot":
        size = int(argv[2]) if len(argv) > 2 else 1200
        reply = send({"type": "get_viewport_screenshot", "params": {"filepath": str(Path(argv[1]).resolve()), "max_size": size}})
    else:
        print(f"unknown command {cmd}", file=sys.stderr)
        return 2
    if reply.get("status") == "success" and cmd == "run":
        print(reply["result"].get("result", ""))
    else:
        print(json.dumps(reply, ensure_ascii=False, indent=1)[:4000])
    return 0 if reply.get("status") == "success" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
