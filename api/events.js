// GET reader for the admin panel. Returns the most recent N events as JSON,
// password-gated by the ADMIN_PASS environment variable set in Vercel.
//
// Query params:
//   pass   — must match process.env.ADMIN_PASS
//   limit  — number of events to return (default 2000, max 10000)
import { kv } from '@vercel/kv';

const EVENTS_KEY = 'ekccf:events';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET')
    return new Response('method not allowed', { status: 405, headers: cors });

  const url = new URL(req.url);
  const pass = url.searchParams.get('pass') || '';
  const want = process.env.ADMIN_PASS || '';

  if (!want || pass !== want)
    return new Response('forbidden', { status: 403, headers: cors });

  const limit = Math.min(10000, Math.max(1, parseInt(url.searchParams.get('limit') || '2000', 10)));

  try {
    const raw = await kv.lrange(EVENTS_KEY, 0, limit - 1);
    const events = raw.map(s => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; } }).filter(Boolean);
    const total = await kv.llen(EVENTS_KEY);
    return new Response(JSON.stringify({ total, returned: events.length, events }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return new Response('kv error: ' + err.message, { status: 500, headers: cors });
  }
}
