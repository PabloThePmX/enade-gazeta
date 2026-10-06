// Minimal static server to open the app at http://localhost:5173 (no dependencies).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.normalize(path.join(dir, url));
    if (!file.startsWith(dir)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(port, () => console.log(`Enade Gazeta at http://localhost:${port}`));
