// Minimal static server rooted at the repo, for model inspection only (127.0.0.1:5190).
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join, normalize } from 'node:path';
const root = normalize(join(process.cwd(), '../..'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' };
createServer(async (req, res) => { const p = normalize(join(root, decodeURIComponent(req.url.split('?')[0]))); if (!p.startsWith(root)) return res.end();
  let body; try { body = await readFile(p); } catch { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[extname(p)] ?? 'application/octet-stream' }); res.end(body); }).listen(5190, '127.0.0.1');
console.log('static on 5190');
