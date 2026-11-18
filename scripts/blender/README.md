# Blender 建模

书斋里结构明确、需要精确可控的器具在 Blender 里用 Python 脚本建模，比 AI 文生模型更可控，可反复修改。

## 连接方式

Blender 已装 BlenderMCP 插件（N 面板「Blender MCP」，Connect 后监听 `127.0.0.1:9876`）。`bmcp.py` 直接走插件的 socket 协议（与 blender-mcp 服务端相同），不需要另起 MCP 进程：

```bash
python scripts/blender/bmcp.py ping                     # 检查连接
python scripts/blender/bmcp.py run scripts/blender/jiaobei.py
python scripts/blender/bmcp.py shot logs/blender/view.png   # 当前视口截图
```

脚本都在各自的新场景（`LY_*`）里运行，不修改、不保存你正在打开的 .blend。导出前清空所有场景的选择并只导出当前场景（`use_active_scene=True`），否则其它 `LY_*` 场景里残留选中的物件会混进 GLB；`pack-blender.mjs` 也会丢弃未被任何网格使用的材质。可编辑源文件用 `bpy.data.libraries.write` 另存到 `assets-src/blender/`。

## 资源

| 脚本 | 产物 | 说明 |
|---|---|---|
| `jiaobei.py` | `apps/web/public/models/jiaobei.glb`、`assets-src/blender/jiaobei.blend`、`logs/blender/jiaobei-*.png` | 月牙木筊：超椭圆截面（凸面 + 微鼓平面，边缘圆润连续），弯月中线，两端渐收；朱漆凸面带刷痕与边缘磨损，平面为红染直纹木。导出后再跑 `node logs/model-work/pack-blender.mjs <glb> 2048` 做 meshopt 压缩（约 380 KB）。 |
| `lamp.py` | `apps/web/public/models/desk_lamp.glb`、`assets-src/blender/desk_lamp.blend`、`logs/blender/desk_lamp-preview.png` | 书斋台灯：两级倒角红木底座、车削木柱、黄铜灯头与三根撑杆、六角梯形宣纸灯罩（木框、腰线、角部垂饰）、前两角红流苏。材质名 `lamp_paper`/`lamp_bulb` 与网页约定（纸罩自发光暖色），导出后 `pack-blender.mjs <glb> 1024`。 |
| `qiuqian.py` | `apps/web/public/models/qiuqian_tube.glb`（节点 `qiuqian_tube`、`qiuqian_lot`）、`assets-src/blender/qiuqian.blend`、`logs/blender/qiuqian-*.png` | 关帝签筒：带壁厚与圆唇的朱漆筒身（刷痕、口沿/铜箍上方/手握处磨损）、深色漆足、三道带凸棱的铜箍；正面黑漆匾额配金框，「靈籤」二字取楷体字库真实字形挤出后贴合筒面。签条单独成节点，正面 UV 占 u .06–1，网页据此在抽中的签上印「第X籤」。导出后 `pack-blender.mjs <glb> 1024`（约 360 KB）。 |
| `desk.py` | `apps/web/public/models/desk.glb`、`assets-src/blender/desk.blend`、`logs/blender/desk-preview.png` | 明式红木书案（参考 `logs/reference` 图一）：四框攒心板（框料各自顺纹、斜角接缝暗线）、框面一圈铜回纹嵌线（两道边线 + 回字纹 + 四角方纹）、冰盘沿、束腰、带阳线的牙板、马蹄足；程序生成可平铺红木纹。桌面 y=0，前沿 glTF z=+3.9，向后延伸到镜头外。导出后 `pack-blender.mjs <glb> 2048`（约 136 KB）。 |
| `paper.py` | `logs/blender/paper-sheet.png` → `apps/web/src/study/assets/paper-sheet.webp` | 手工宣纸：致密网格加平滑起伏（纸干后的轻微波浪），低角度光照，毛边由透明通道生成。信笺是可编辑网页元素，所以交付为带透明边的俯视渲染图，文字不烘焙。 |

坐标约定（导出到 glTF/three.js 后）：长度沿 X，凸面朝 +Y，最低点 y = 0，原点在投影中心。
