// POST collector. The page's navigator.sendBeacon() posts a single JSON event
// here; this appends it to a Vercel KV list and returns 200.
//
// The list is capped (via LTRIM) so storage stays within the free tier.
import { kv } from '@vercel/kv';

const EVENTS_KEY = 'ekccf:events';
const MAX_EVENTS = 50000; // ~free-tier friendly; drop oldest beyond this

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Permissive CORS so the page can POST from any host (artifact preview,
  // GitHub Pages, custom domain, etc.).
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST')
    return new Response('method not allowed', { status: 405, headers: cors });

  let body;
  try { body = await req.text(); } catch { body = ''; }

  let payload;
  try { payload = JSON.parse(body); } catch { payload = { kind: 'parse_error', raw: body.slice(0, 500) }; }

  const events = Array.isArray(payload) ? payload : [payload];

  // Enrich each event with the request's own metadata the page can't see.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const ua = req.headers.get('user-agent') || '';
  const referer = req.headers.get('referer') || '';
  const country = req.headers.get('x-vercel-ip-country') || '';
  const now = Date.now();

  const enriched = events.slice(0, 100).map(ev => ({
    t: ev.t || now,
    received_at: now,
    s: ev.s || '',
    kind: ev.kind || '',
    title: ev.title,
    url: ev.url,
    percent: ev.percent,
    seconds: ev.seconds,
    ms: ev.ms,
    section: ev.section,
    term: ev.term,
    name: ev.name,
    path: ev.path,
    ip_hash: ip ? await sha1(ip) : '', // hash the IP so we don't store raw addresses
    ua,
    referer,
    country,
  }));

  try {
    const entries = enriched.map(e => JSON.stringify(e));
    if (entries.length) {
      await kv.lpush(EVENTS_KEY, ...entries);
      await kv.ltrim(EVENTS_KEY, 0, MAX_EVENTS - 1);
    }
  } catch (err) {
    return new Response('kv error: ' + err.message, { status: 500, headers: cors });
  }

  return new Response('ok', { status: 200, headers: cors });
}

async function sha1(s) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}
