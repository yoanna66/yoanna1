import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import chat from './api/chat.js';

const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/chat.js', ['chat.js', 'text/javascript']],
]);
export const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/chat') return chat(req, res);
  const file = files.get(path);
  if (!file || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const content = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
    res.setHeader('Content-Type', `${file[1]}; charset=utf-8`);
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(500).end('Unable to load page');
  }
});
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log('聊天網站已啟動，連接埠：' + (process.env.PORT || 3000)));
}
