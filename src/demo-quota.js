import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export const DEMO_LIMITS = Object.freeze({ ipMinute: 5, ipDaily: 20, globalDaily: 500 });

// One reservation checks and increments all buckets atomically. Redis's clock
// sets the windows, so deploys/cold starts and concurrent functions share them.
export const QUOTA_SCRIPT = `
local now = tonumber(redis.call('TIME')[1])
local windows = {60, 86400, 86400}
local counts = {}
local resets = {}
for i = 1, 3 do
  local start = math.floor(now / windows[i]) * windows[i]
  resets[i] = start + windows[i]
  local saved = redis.call('HMGET', KEYS[i], 'window', 'count')
  counts[i] = 0
  if saved[1] and tonumber(saved[1]) == start then
    counts[i] = tonumber(saved[2])
    if not counts[i] or counts[i] < 0 then error('Invalid quota counter') end
  end
end
-- Daily limits take precedence over temporary minute throttles.
for _, i in ipairs({3, 2, 1}) do
  if counts[i] >= tonumber(ARGV[i]) then
    return {0, i, resets[i] - now, 0}
  end
end
for i = 1, 3 do
  redis.call('HSET', KEYS[i], 'window', resets[i] - windows[i], 'count', counts[i] + 1)
  redis.call('EXPIREAT', KEYS[i], resets[i])
end
return {1, 0, 0, tonumber(ARGV[2]) - counts[2] - 1}
`;

export function clientIp(request, env) {
  const value = env.VERCEL ? request.headers?.['x-vercel-forwarded-for'] : request.remoteAddress;
  if (typeof value !== 'string' || !isIP(value)) throw new Error('Client IP is unavailable');
  if (isIP(value) === 4) return value;
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(normalized);
  if (!mapped) return normalized;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

export function createDemoQuota({ env = process.env, fetchImpl = fetch, namespace } = {}) {
  return async (request) => {
    const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
    const secret = env.JEV_QUOTA_SECRET;
    if (!env.VERCEL && !env.JEV_PUBLIC_ORIGIN && !url && !token && !secret) return { allowed: true };
    if (!url || !token || typeof secret !== 'string' || secret.length < 32) throw new Error('Demo quota is not configured');
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('Invalid Redis endpoint');
    const ip = clientIp(request, env);
    const digest = createHmac('sha256', secret).update(ip).digest('hex');
    const scope = namespace ?? `jev-demo-v1-${env.VERCEL_ENV ?? 'local'}`;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(scope)) throw new Error('Invalid quota namespace');
    const prefix = `{${scope}}`;
    const command = ['EVAL', QUOTA_SCRIPT, 3, `${prefix}:minute:${digest}`, `${prefix}:daily:${digest}`, `${prefix}:global`, DEMO_LIMITS.ipMinute, DEMO_LIMITS.ipDaily, DEMO_LIMITS.globalDaily];
    // Never retry a reservation: a lost response might already have consumed it.
    const response = await fetchImpl(endpoint.href, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command), cache: 'no-store', signal: AbortSignal.timeout(3000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Quota service unavailable');
    const payload = await response.json();
    const result = payload?.result;
    if (payload.error || !Array.isArray(result) || result.length !== 4 || result.some(x => !Number.isSafeInteger(x))) throw new Error('Invalid quota response');
    const [allowed, bucket, retryAfter, remainingDaily] = result;
    if (allowed === 1 && bucket === 0 && retryAfter === 0 && remainingDaily >= 0 && remainingDaily < DEMO_LIMITS.ipDaily) return { allowed: true, remainingDaily };
    if (allowed === 0 && bucket >= 1 && bucket <= 3 && retryAfter >= 1 && retryAfter <= (bucket === 1 ? 60 : 86400) && remainingDaily === 0) {
      return { allowed: false, scope: ['ip_minute', 'ip_daily', 'global_daily'][bucket - 1], retryAfter };
    }
    throw new Error('Invalid quota response');
  };
}
