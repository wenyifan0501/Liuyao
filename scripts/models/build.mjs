// 离线构建桌面 GLB：保持朝向和尺寸，简化网格，压缩 WebP 纹理及 meshopt。
// 将本文件与 quat.mjs 复制到 logs/model-work，使用该目录已有依赖运行。
// 用法：node logs/model-work/build.mjs turtle_shell teacup_saucer inkstone brush_rest seal
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt, getBounds, resample, unpartition, flatten, join } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quat } from './quat.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const WORK = joinPath(REPO, 'logs/model-work');
const RAW = joinPath(WORK, 'raw');
const OUT = joinPath(REPO, 'apps/web/public/models');
const BACKUP = joinPath(WORK, 'desktop-previous');
const MODEL_NAMES = ['turtle_shell', 'teacup_saucer', 'inkstone', 'brush_rest', 'seal'];
const MAX_TOTAL_BYTES = 3_300_000;
// rotate：定尺寸前的 XYZ 角度；fit：与 size 对齐的世界坐标轴。
// ratio：简化目标比例；tex：纹理最大边长。
export const CONFIG = {
  turtle_shell: { rotate: [0, 0, 0], fit: 'z', size: 2.96, ratio: .65, tex: 2048 },
  teacup_saucer: { rotate: [0, 0, 0], fit: 'x', size: 1.24, ratio: .5, tex: 1024 },
  inkstone: { rotate: [0, 90, 0], fit: 'z', size: 1.9, ratio: .5, tex: 1024 },
  brush_rest: { rotate: [0, 90, 0], fit: 'max', size: 2.2, ratio: .5, tex: 1024 },
  seal: { rotate: [0, 0, 0], fit: 'y', size: .62, ratio: .6, tex: 1024 },
  candle: { rotate: [0, 0, 0], fit: 'y', size: 1.0, ratio: .3, tex: 512 },
  books: { rotate: [0, 0, 0], fit: 'z', size: 2.0, ratio: .25, tex: 1024 },
  plum_branch: { rotate: [0, 0, 0], fit: 'max', size: 1.9, ratio: .35, tex: 512 },
  jiaobei: { rotate: [0, 0, 0], fit: 'x', size: 1.2, ratio: .3, tex: 512 },
  qiuqian_tube: { rotate: [0, 0, 0], fit: 'y', size: 1.2, ratio: .3, tex: 1024 },
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : MODEL_NAMES;
if (names.some(name => !MODEL_NAMES.includes(name)) || new Set(names).size !== names.length) {
  throw new Error(`仅允许指定且不重复的五个模型：${MODEL_NAMES.join(', ')}`);
}
if (!statSync(WORK).isDirectory() || !statSync(OUT).isDirectory()) {
  throw new Error('构建目录或模型输出目录不存在');
}
for (const name of names) statSync(joinPath(RAW, name, 'glb_1.glb'));
mkdirSync(BACKUP, { recursive: true });
for (const name of names) {
  const output = joinPath(OUT, `${name}.glb`), backup = joinPath(BACKUP, `${name}.glb`);
  if (existsSync(output) && !existsSync(backup)) copyFileSync(output, backup, constants.COPYFILE_EXCL);
}
const io = new NodeIO().setAllowNetwork(false).registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const outputs = new Map();
for (const name of names) {
  const cfg = CONFIG[name];
  const doc = await io.readBinary(readFileSync(joinPath(RAW, name, 'glb_1.glb')));
  const root = doc.getRoot(), scene = root.getDefaultScene() ?? root.listScenes()[0];
  await doc.transform(dedup(), prune(), flatten(), join(), weld());
  const pivot = doc.createNode('pivot').setRotation(quat(cfg.rotate));
  for (const child of scene.listChildren()) { scene.removeChild(child); pivot.addChild(child); }
  const holder = doc.createNode(name).addChild(pivot); scene.addChild(holder);
  let b = getBounds(scene);
  const ext = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const current = cfg.fit === 'x' ? ext[0] : cfg.fit === 'y' ? ext[1] : cfg.fit === 'z' ? ext[2] : Math.max(...ext);
  const s = cfg.size / current;
  holder.setScale([s, s, s]);
  b = getBounds(scene);
  holder.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
  await doc.transform(
    simplify({ simplifier: MeshoptSimplifier, ratio: cfg.ratio, error: 0.0015 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [cfg.tex, cfg.tex], quality: 88 }),
    resample(), unpartition(), prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const binary = await io.writeBinary(doc);
  const decoded = await io.readBinary(binary);
  outputs.set(name, binary);
  b = getBounds(decoded.getRoot().getDefaultScene() ?? decoded.getRoot().listScenes()[0]);
  const tris = decoded.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
  console.log(name, `${binary.byteLength} 字节`, `${tris} 三角面`, '边界尺寸', b.max.map((v, i) => v - b.min[i]).join(' x '));
}
// 先在内存完成全部打包；即使仅重建部分模型，也检查五个文件的总预算。
const totalBytes = MODEL_NAMES.reduce((total, name) => total + (outputs.get(name)?.byteLength ?? statSync(joinPath(OUT, `${name}.glb`)).size), 0);
if (totalBytes > MAX_TOTAL_BYTES) {
  throw new Error(`五模型共 ${totalBytes} 字节，超过 ${MAX_TOTAL_BYTES} 字节预算；未覆盖输出文件`);
}
for (const [name, binary] of outputs) writeFileSync(joinPath(OUT, `${name}.glb`), binary);
console.log(`五模型总计 ${totalBytes} 字节；预算剩余 ${MAX_TOTAL_BYTES - totalBytes} 字节；备份目录 ${BACKUP}`);
