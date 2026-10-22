import { env } from 'cloudflare:workers';
import { DEFAULT_MODEL } from '../../../lib/deepseek.mjs';
import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!await getChatGPTUser()) return Response.json({error:'AUTH_REQUIRED'}, {status:401,headers:{'Cache-Control':'no-store'}});
  return Response.json({configured:!!env.DEEPSEEK_API_KEY?.trim(),provider:'DeepSeek',model:env.DEEPSEEK_MODEL||DEFAULT_MODEL},{headers:{'Cache-Control':'no-store'}});
}
