import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { evaluateGuardrail } from './guard.js';
import { validateInput } from './context.js';

const MAX_TEXT_LENGTH = 20_000;
const MAX_BODY_BYTES = 128_000;
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/view.js', ['view.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function isLocalHost(host) {
  return typeof host === 'string' && /^127\.0\.0\.1(?::\d{1,5})?$/.test(host);
}

function isAllowedRequest(headers, env) {
  const { host, origin } = headers;
  if (!env.VERCEL && !env.JEV_PUBLIC_ORIGIN) {
    return isLocalHost(host) && (!origin || origin === `http://${host}`);
  }
  if (typeof host !== 'string' || typeof origin !== 'string' || origin !== `https://${host}`) return false;
  const approved = [env.JEV_PUBLIC_ORIGIN, env.VERCEL_URL && `https://${env.VERCEL_URL}`, env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`];
  return approved.some((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && url.origin === origin;
    } catch { return false; }
  });
}

export async function handleApiRequest(request, {
  env = process.env,
  evaluate = evaluateGuardrail,
} = {}) {
  const { method, headers = {}, body } = request;
  if (!isAllowedRequest(headers, env)) {
    return { status: 403, body: { error: 'Bu istek izin verilen demo adresinden gelmelidir.' } };
  }
  if (method !== 'POST') {
    return { status: 405, body: { error: 'POST kullanın.' } };
  }
  if (!/^application\/json(?:\s*;|$)/i.test(headers['content-type'] ?? '')) {
    return { status: 415, body: { error: 'JSON gövdesi gerekli.' } };
  }
  if (typeof body !== 'string' || Buffer.byteLength(body) > MAX_BODY_BYTES) {
    return { status: 413, body: { error: 'Metin çok uzun. En fazla 20.000 karakter girin.' } };
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { status: 400, body: { error: 'Geçerli bir JSON gönderin.' } };
  }
  const text = payload?.text;
  if (typeof text !== 'string' || !text.trim()) {
    return { status: 400, body: { error: 'Denemek için bir metin girin.' } };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { status: 413, body: { error: 'Metin çok uzun. En fazla 20.000 karakter girin.' } };
  }
  let input;
  try {
    if (payload.sourceContext !== undefined) throw new Error('sourceContext kaldırıldı; context alanını kullanın.');
    input = validateInput(payload);
  } catch (error) {
    return { status: 400, body: { error: error.message } };
  }
  if (!env.TYPESAFE_API_KEY) {
    return { status: 503, body: { error: 'Sunucuda TYPESAFE_API_KEY ayarlanmamış.' } };
  }

  try {
    const result = await evaluate(input, {
      apiKey: env.TYPESAFE_API_KEY,
      baseURL: env.TYPESAFE_BASE_URL,
      model: env.TYPESAFE_DEFAULT_MODEL,
    });
    return { status: 200, body: result };
  } catch {
    return { status: 502, body: { error: 'Jev isteği başarısız. Sunucu ayarlarını ve API erişimini kontrol edin.' } };
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        tooLarge = true;
        reject(new RangeError('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}

export function createDemoServer({ env = process.env, evaluate = evaluateGuardrail } = {}) {
  return createServer(async (request, response) => {
    let path;
    try { path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname; }
    catch { json(response, 400, { error: 'Geçersiz istek adresi.' }); return; }
    if (request.method === 'GET' && STATIC_FILES.has(path)) {
      const [filename, contentType] = STATIC_FILES.get(path);
      try {
        const content = await readFile(new URL(`../web/${filename}`, import.meta.url));
        response.writeHead(200, {
          'content-type': contentType,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'",
        });
        response.end(content);
      } catch {
        json(response, 500, { error: 'Demo dosyası açılamadı.' });
      }
      return;
    }
    if (path === '/api/evaluate') {
      let body;
      try {
        body = await readRequestBody(request);
      } catch (error) {
        json(response, error instanceof RangeError ? 413 : 400, { error: 'İstek okunamadı veya çok uzun.' });
        return;
      }
      const result = await handleApiRequest({ method: request.method, headers: request.headers, body }, { env, evaluate });
      json(response, result.status, result.body);
      return;
    }
    json(response, 404, { error: 'Sayfa bulunamadı.' });
  });
}
