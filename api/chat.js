import OpenAI from 'openai';

const WINDOW = 60_000;
const MAX_BODY = 24_000;
const buckets = new Map();

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

export default async function chat(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: '請使用 POST 傳送訊息。' });
  }
  // Vercel supplies this header; local server uses the socket address instead.
  const ip = process.env.VERCEL === '1'
    ? String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    : req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  for (const [key, entry] of buckets) if (entry.reset <= now) buckets.delete(key);
  const bucket = buckets.get(ip) || { count: 0, reset: now + WINDOW };
  if (bucket.count >= 10 || (!buckets.has(ip) && buckets.size >= 10_000)) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.reset - now) / 1000))));
    return reply(res, 429, { error: '請求過於頻繁，請稍後再試。' });
  }
  bucket.count++;
  buckets.set(ip, bucket);
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    return reply(res, 415, { error: '請使用 application/json。' });
  }
  // Reject browser cross-origin requests; no cross-origin CORS permission is granted.
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    return reply(res, 403, { error: '不允許跨網站請求。' });
  }
  let body;
  try {
    if (req.body !== undefined) {
      if (Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) > MAX_BODY) {
        return reply(res, 413, { error: '訊息資料過大。' });
      }
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > MAX_BODY) return reply(res, 413, { error: '訊息資料過大。' });
        chunks.push(Buffer.from(chunk));
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  } catch {
    return reply(res, 400, { error: '無法讀取 JSON 資料。' });
  }
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 12 ||
      messages.some((m, i) => !m || m.role !== (i % 2 === 0 ? 'user' : 'assistant') ||
        typeof m.content !== 'string' || !m.content.trim() || m.content.length > 2000) ||
      messages.at(-1).role !== 'user' || messages.reduce((n, m) => n + m.content.length, 0) > 8000) {
    return reply(res, 400, { error: '請提供交替的對話訊息，以使用者訊息結尾；每則最多 2000 字，總計最多 8000 字。' });
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return reply(res, 503, { error: '聊天服務尚未設定，請聯絡網站管理者。' });
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 0 });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      instructions: '你是友善的 AI 助理。預設使用繁體中文回答，清楚說明不確定的資訊。',
      input: messages.map(({ role, content }) => ({ role, content })),
      max_output_tokens: 1200,
      store: false,
    });
    if (response.status !== 'completed' || !response.output_text?.trim()) {
      return reply(res, 502, { error: 'AI 未能完成回答，請縮短問題後再試。' });
    }
    return reply(res, 200, { reply: response.output_text });
  } catch (error) {
    // Never log upstream bodies, credentials, or user conversation.
    if (error.status === 429) return reply(res, 503, { error: 'AI 服務目前忙碌或額度不足，請稍後再試。' });
    if (error instanceof OpenAI.APIConnectionTimeoutError) return reply(res, 504, { error: 'AI 回應逾時，請稍後再試。' });
    return reply(res, 502, { error: '暫時無法連線至 AI 服務，請稍後再試。' });
  }
}
