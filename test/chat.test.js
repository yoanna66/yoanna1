import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { server } from '../server.js';
import chat from '../api/chat.js';

// These exercise real HTTP and validation; no AI answers or SDK calls are mocked.
test('HTTP website and chat validation', async (t) => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
    await new Promise(resolve => server.close(resolve));
  });
  const post = (body, headers = {}) => fetch(`${base}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body,
  });
  await t.test('public assets load and private files are inaccessible', async () => {
    for (const [path, type] of [['/', 'text/html'], ['/styles.css', 'text/css'], ['/chat.js', 'text/javascript']]) {
      const r = await fetch(base + path);
      assert.equal(r.status, 200);
      assert.ok(r.headers.get('content-type').startsWith(type));
      assert.ok((await r.text()).length > 100);
      assert.ok(r.headers.get('content-security-policy'));
    }
    for (const path of ['/.env', '/.env.example', '/api/chat.js', '/package.json', '/README.md']) {
      assert.equal((await fetch(base + path)).status, 404);
    }
  });
  await t.test('GET rejected', async () => {
    const r = await fetch(base + '/api/chat');
    assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'POST');
  });
  await t.test('invalid media, JSON, input and cross-site requests rejected', async () => {
    assert.equal((await post('{}', { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post(JSON.stringify({ messages: [] }))).status, 400);
    assert.equal((await post(JSON.stringify({ messages: [{ role: 'system', content: 'x' }] }))).status, 400);
    assert.equal((await post(JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(2001) }] }))).status, 400);
    assert.equal((await post('{}', { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await post(JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(25000) }] }))).status, 413);
  });
  await t.test('missing credential gives safe failure rather than a fake answer', async () => {
    const r = await post(JSON.stringify({ messages: [{ role: 'user', content: '你好' }] }));
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const body = await r.json();
    assert.ok(body.error); assert.equal(body.reply, undefined);
    assert.ok(!JSON.stringify(body).includes('OPENAI_API_KEY'));
  });
  await t.test('rate limit returns 429 and Retry-After', async () => {
    await post('{}'); await post('{}');
    const r = await post('{}');
    assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0);
  });
});

test('Vercel pre-parsed body is validated', async () => {
  const req = { method: 'POST', headers: { 'content-type': 'application/json' }, socket: { remoteAddress: 'vercel-body-test' }, body: { messages: [{ role: 'user', content: ' ' }] } };
  const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, end(body) { this.body=JSON.parse(body); } };
  await chat(req,res);
  assert.equal(res.statusCode,400);
});

test('real OpenAI Responses API integration (explicit opt-in)', {
  skip: process.env.RUN_OPENAI_INTEGRATION !== '1' || !process.env.OPENAI_API_KEY,
}, async () => {
  const req = { method: 'POST', headers: { 'content-type': 'application/json' }, socket: { remoteAddress: 'live-openai-test' }, body: { messages: [{ role: 'user', content: '請用繁體中文簡短打招呼。' }] } };
  const res = { setHeader() {}, end(body) { this.body=JSON.parse(body); } };
  await chat(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(typeof res.body.reply,'string');
  assert.ok(res.body.reply.trim());
});
