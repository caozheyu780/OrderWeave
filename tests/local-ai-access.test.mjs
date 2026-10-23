import test from 'node:test';
import assert from 'node:assert/strict';
import {sites} from '../scripts/vite/sites-vite-plugin.ts';

function middleware(mockAuth=true){
 let handle;
 const plugin=sites({mockAuth});
 plugin.configureServer({config:{server:{},logger:{info(){}}},middlewares:{use(fn){handle=fn;}}});
 return handle;
}
function request(path,{host='127.0.0.1:5173',remote='127.0.0.1',headers={}}={}){
 return {url:path,method:'GET',headers:{host,...headers},rawHeaders:Object.entries({host,...headers}).flat(),socket:{remoteAddress:remote}};
}
function dispatch(handle,req){
 let next=false;const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(){this.ended=true;}};
 handle(req,response,()=>{next=true;});return {req,response,next};
}

test('local AI status and parsing need no sign-in cookie on a validated loopback connection',()=>{
 const handle=middleware();
 for(const path of ['/api/ai-status','/api/parse-order','/api/ai-status?check=1']){
  const {req,next,response}=dispatch(handle,request(path));assert.equal(next,true);assert.equal(response.ended,undefined);assert.equal(req.headers['oai-authenticated-user-id'],'local_seedy');assert.equal(req.headers['oai-authenticated-user-email'],'seedy@sites.test');assert.equal(response.headers['Set-Cookie'],undefined);
 }
 for(const host of ['localhost:5173','[::1]:5173'])assert.equal(dispatch(handle,request('/api/ai-status',{host,remote:'::1'})).req.headers['oai-authenticated-user-id'],'local_seedy');
});

test('local AI access does not trust spoofed identities, other hosts or remote clients',()=>{
 const handle=middleware(),forged={'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'forged@example.test'};
 for(const opts of [{host:'store.example.test'},{remote:'192.168.1.2'},{host:'192.168.1.10:5173'}]){
  const {req}=dispatch(handle,request('/api/ai-status',{...opts,headers:forged}));assert.equal(req.headers['oai-authenticated-user-id'],undefined);assert.ok(!req.rawHeaders.includes('forged'));
 }
 const result=dispatch(handle,request('/api/ai-status',{headers:forged}));assert.equal(result.req.headers['oai-authenticated-user-id'],'local_seedy');assert.ok(!result.req.rawHeaders.includes('forged'));
 assert.equal(middleware(false),undefined);
});

test('automatic local AI access leaves unrelated routes and explicit sign-in/out behavior intact',()=>{
 const handle=middleware();
 assert.equal(dispatch(handle,request('/api/workspace')).req.headers['oai-authenticated-user-id'],undefined);
 const signIn=dispatch(handle,request('/signin-with-chatgpt?return_to=/'));assert.equal(signIn.response.statusCode,302);assert.match(signIn.response.headers['Set-Cookie'],/__sites_local_auth=1/);
 const signOut=dispatch(handle,request('/signout-with-chatgpt'));assert.match(signOut.response.headers['Set-Cookie'],/Max-Age=0/);
 const signedIn=dispatch(handle,request('/other',{headers:{cookie:'__sites_local_auth=1'}}));assert.equal(signedIn.req.headers['oai-authenticated-user-id'],'local_seedy');
});
