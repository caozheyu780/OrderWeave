import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handleWorkspace} from '../../../lib/workspace.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleWorkspace(request,env,await getChatGPTUser());}
export async function POST(request:Request){return handleWorkspace(request,env,await getChatGPTUser());}
