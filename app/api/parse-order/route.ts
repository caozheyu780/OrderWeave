import { env } from 'cloudflare:workers';
import { AIError, extractOrder } from '../../../lib/deepseek.mjs';
import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic = 'force-dynamic';
const rate = new Map<string, {start: number; count: number}>();
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({error:'AUTH_REQUIRED'}, {status:401});
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({error:'FORBIDDEN'}, {status:403});
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error:'INVALID_REQUEST'}, {status:415});
  const now = Date.now();
  // Best-effort per-isolate throttling, in addition to the private Site access gate.
  for (const [key, value] of rate) if (now - value.start > 60000) rate.delete(key);
  const bucket = rate.get(user.userId) || {start:now, count:0};
  if (bucket.count >= 12) return Response.json({error:'AI_RATE_LIMIT'}, {status:429, headers:{'Retry-After':'60','Cache-Control':'no-store'}});
  bucket.count++; rate.set(user.userId, bucket);
  try {
    if (Number(request.headers.get('content-length') || 0) > 200000) throw new AIError('REQUEST_TOO_LARGE', 413);
    const reader = request.body?.getReader();
    if (!reader) throw new AIError('INVALID_REQUEST', 400);
    const chunks: Uint8Array[] = []; let length = 0;
    try { while (true) { const {done, value} = await reader.read(); if (done) break; length += value.length; if (length > 200000) { await reader.cancel(); throw new AIError('REQUEST_TOO_LARGE',413); } chunks.push(value); } } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) {bytes.set(chunk,offset); offset += chunk.length;}
    let input; try {input = JSON.parse(new TextDecoder().decode(bytes));} catch {throw new AIError('INVALID_REQUEST',400);}
    const member = env.DB && typeof input.merchantId==='string' && await env.DB.prepare('SELECT id FROM members WHERE store_id=? AND user_id=? AND disabled=0').bind(input.merchantId,user.userId).first();
    if(!member) return Response.json({error:'AUTH_REQUIRED'}, {status:403,headers:{'Cache-Control':'no-store'}});
    const result = await extractOrder(input, env);
    return Response.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    const known = error instanceof AIError;
    const code = known ? error.code : 'AI_UNAVAILABLE';
    const status = known ? error.status : 502;
    const requestId = crypto.randomUUID();
    // Diagnostics intentionally exclude the input text, headers, key and upstream body.
    console.error(JSON.stringify({event:'order_ai_failure',code,status,requestId}));
    return Response.json({error:code,requestId}, {status, headers:{'Cache-Control':'no-store'}});
  }
}
