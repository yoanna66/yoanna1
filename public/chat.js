const form = document.querySelector('#chat-form');
const input = document.querySelector('#message');
const send = document.querySelector('#send');
const clear = document.querySelector('#clear');
const log = document.querySelector('#messages');
const status = document.querySelector('#status');
let history = [];

function addMessage(role, content) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  const label = document.createElement('strong');
  label.textContent = role === 'user' ? '你' : 'AI';
  const text = document.createElement('p');
  text.textContent = content; // Treat all model output as text, never HTML.
  article.append(label, text);
  log.append(article);
}

clear.addEventListener('click', () => {
  history = [];
  log.replaceChildren();
  status.textContent = '已清除對話。';
  input.focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content || send.disabled) return;
  // Keep complete user/assistant pairs and leave room for a new user message.
  const messages = [...history.slice(-10), { role: 'user', content }];
  while (messages.length > 1 && messages.reduce((n, m) => n + m.content.length, 0) > 8000) messages.splice(0, 2);
  send.disabled = clear.disabled = input.disabled = true;
  form.setAttribute('aria-busy', 'true');
  status.textContent = 'AI 正在思考，請稍候…';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '傳送失敗，請稍後再試。');
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('AI 未回傳可顯示的內容。');
    addMessage('user', content);
    addMessage('assistant', data.reply);
    // Bound retained assistant context to the backend's per-message limit.
    history = [...messages, { role: 'assistant', content: data.reply.slice(0, 2000) }];
    input.value = '';
    status.textContent = '回答完成。';
  } catch (error) {
    status.textContent = error.name === 'AbortError' ? '等待回應逾時，請稍後再試。' : (error instanceof TypeError ? '網路連線失敗，請稍後再試。' : error.message);
  } finally {
    clearTimeout(timeout);
    send.disabled = clear.disabled = input.disabled = false;
    form.removeAttribute('aria-busy');
    input.focus();
  }
});
