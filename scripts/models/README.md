# 桌面模型流水线

`apps/web/public/models/*.glb` 由混元 3D 文生模型生成后，经本目录脚本优化得到。原始模型（每个约 30 MB）不入库，放在 `logs/model-work/raw/`。

1. 在 `logs/model-work/` 安装工具：`npm i @gltf-transform/cli@4 @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer sharp playwright-core`，并把本目录脚本复制过去。
2. `prompts.tsv` 是每个模型的生成提示词；`runner.py` 串行生成并下载，通过 `--script` 指定已安装的官方生成脚本，凭据仅从 `MODEL_GENERATION_TOKEN` 环境变量读取，不写入文件。提交或查询失败立即停止，额度错误不会自动重提。已有任务编号只查询，下载失败可用 `--download-only` 重试已保存结果。
3. `node logs/model-work/build.mjs turtle_shell teacup_saucer inkstone brush_rest seal`：按 `CONFIG` 保留原有朝向、尺寸，底面落到 y=0，压缩为 WebP + meshopt；路径由脚本位置推导，不依赖当前工作目录。现版优先桌面画质：龟甲约 3.9 万三角面、2K 纹理，其余约 3–3.6 万三角面、1K 纹理；五件合计约 2.82 MB。旧输出首次备份到 `logs/model-work/desktop-previous/`，五模型总预算为 3.3 MB，超限不会覆盖输出。
4. `node static.mjs` 后 `node inspect.mjs raw|out name...`：从正面 +Z、侧面 +X、顶部、斜 45° 四视角渲染检查朝向和画质。

运行时由 `apps/web/src/study/models.tsx` 加载（`MeshoptDecoder`），`tune` 回调只在运行时修正材质（如金属度、色调），不改源文件。
