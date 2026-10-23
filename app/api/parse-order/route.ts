import {readAIInput} from '../../../lib/ai-request.mjs';
import { env } from 'cloudflare:workers';
import { AIError, extractOrder } from '../../../lib/deepseek.mjs';
import { extractMenu } from '../../../lib/menu-extraction.mjs';
import { getChatGPTUser } from '../../chatgpt-auth';
import {LOCAL_DEMO} from '../../../lib/app-mode.mjs';
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
    const input = await readAIInput(request);
    if(!LOCAL_DEMO){const member = env.DB && typeof input.merchantId==='string' && await env.DB.prepare('SELECT id FROM members WHERE store_id=? AND user_id=? AND disabled=0').bind(input.merchantId,user.userId).first();
    if(!member) return Response.json({error:'AUTH_REQUIRED'}, {status:403,headers:{'Cache-Control':'no-store'}});}
    const result = input.kind==='menu'?await extractMenu(input, env):await extractOrder(input, env);
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
