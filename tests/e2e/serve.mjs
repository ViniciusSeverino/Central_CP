// tests/e2e/serve.mjs
//
// HTTP estático mínimo só pra servir app/ (gerado por sync.mjs) num
// endereço real (http://) -- módulos ES e fetch() do navegador não
// funcionam bem em file://, precisa de um servidor de verdade, mesmo que
// simples.
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, 'app');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      let path = req.url.split('?')[0];
      if (path === '/') path = '/index.html';
      const filePath = join(ROOT, path);
      const info = await stat(filePath);
      if (info.isDirectory()) throw new Error('is a directory');
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => {
      const { port: realPort } = server.address();
      resolve({ server, url: `http://127.0.0.1:${realPort}` });
    });
  });
}
