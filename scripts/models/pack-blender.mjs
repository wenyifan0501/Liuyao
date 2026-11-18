// Post-process a Blender-exported GLB in place: meshopt geometry, WebP textures capped at --tex.
// Usage: node pack-blender.mjs <file.glb> [tex=1024]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, meshopt, inspect } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';
const [file, texArg] = process.argv.slice(2);
const tex = Number(texArg ?? 1024);
const io = new NodeIO().setAllowNetwork(false).registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const before = statSync(file).size;
const doc = await io.read(file);
const report = inspect(doc);
console.log('textures (before)', report.textures.properties.map(t => `${t.name} ${t.resolution} ${(t.size / 1024).toFixed(0)}KB`).join(' | '));
// Blender exports every material in the .blend (other LY_* scenes included); keep only those a primitive uses.
const used = new Set(doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).map(p => p.getMaterial()).filter(Boolean));
const dropped = doc.getRoot().listMaterials().filter(m => !used.has(m));
dropped.forEach(m => m.dispose());
if (dropped.length) console.log('dropped unused materials', dropped.length);
await doc.transform(dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 90 }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(file, doc);
console.log(file, before, '->', statSync(file).size, 'bytes');
