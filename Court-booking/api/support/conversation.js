const conversationCookie = 'court_support_conversation';
const tokenCookie = 'court_support_token';

function managementUrl() {
  return (process.env.ALAS_MANAGEMENT_URL || 'https://www.jmgaming.site').replace(/\/$/, '');
}

function cookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').map((part) => {
    const [name, ...value] = part.trim().split('=');
    return [name, decodeURIComponent(value.join('='))];
  }).filter(([name]) => name));
}

function reply(response, status, body, headers = {}) {
  response.statusCode = status;
  Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

async function bodyOf(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  let raw = '';
  for await (const chunk of request) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

async function upstream(path, options = {}) {
  const response = await fetch(`${managementUrl()}${path}`, { ...options, headers: { accept: 'application/json', ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({ error: { message: 'Support returned an invalid response.' } }));
  return { response, payload };
}

export default async function handler(request, response) {
  try {
    const jar = cookies(request);
    const id = jar[conversationCookie];
    const token = jar[tokenCookie];

    if (request.method === 'GET') {
      if (!id || !token) return reply(response, 200, { data: null });
      const result = await upstream(`/api/v1/support/conversations/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      if ([403, 404].includes(result.response.status)) return reply(response, 200, { data: null }, { 'Set-Cookie': [`${conversationCookie}=; Path=/; Max-Age=0`, `${tokenCookie}=; Path=/; Max-Age=0`] });
      return reply(response, result.response.status, result.payload);
    }

    if (request.method !== 'POST') return reply(response, 405, { error: { message: 'Method not allowed.' } }, { Allow: 'GET, POST' });
    const body = await bodyOf(request);

    if (id && token) {
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (!content || content.length > 2000) return reply(response, 422, { error: { message: 'Enter a message up to 2,000 characters.' } });
      const result = await upstream(`/api/v1/support/conversations/${encodeURIComponent(id)}/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ content, client_message_id: body.clientMessageId }), cache: 'no-store',
      });
      return reply(response, result.response.status, result.payload);
    }

    const result = await upstream('/api/v1/support/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: body.displayName, context: { page_path: body.context?.page_path || '/' } }), cache: 'no-store',
    });
    if (!result.response.ok) return reply(response, result.response.status, result.payload);
    const supportToken = result.payload.support_token;
    delete result.payload.support_token;
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return reply(response, result.response.status, result.payload, {
      'Set-Cookie': [
        `${conversationCookie}=${encodeURIComponent(result.payload.data.id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7776000${secure}`,
        `${tokenCookie}=${encodeURIComponent(supportToken)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7776000${secure}`,
      ],
    });
  } catch {
    return reply(response, 503, { error: { message: 'Support is temporarily unavailable.' } });
  }
}
