import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handleWorkspace} from '../../../lib/workspace.mjs';
import {LOCAL_DEMO} from '../../../lib/app-mode.mjs';
export const dynamic='force-dynamic';
const localOnly=()=>Response.json({error:'LOCAL_DEMO'},{status:503,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){return LOCAL_DEMO?localOnly():handleWorkspace(request,env,await getChatGPTUser());}
export async function POST(request:Request){return LOCAL_DEMO?localOnly():handleWorkspace(request,env,await getChatGPTUser());}
