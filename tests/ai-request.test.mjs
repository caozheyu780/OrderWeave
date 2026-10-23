import test from 'node:test';
import assert from 'node:assert/strict';
import {readAIInput} from '../lib/ai-request.mjs';
import {AI_REQUEST_LIMIT} from '../public/import-limits.js';

test('API reads 100,000 Chinese characters plus menu metadata without truncation',async()=>{
  const input={text:'餐'.repeat(100000),menu:[{id:'rice',name:'Rice',minutes:10}]};
  const body=JSON.stringify(input);assert.ok(new TextEncoder().encode(body).length>200000);
  assert.deepEqual(await readAIInput(new Request('https://test.local',{method:'POST',body})),input);
});

test('API rejects declared and streamed overflow and cancels oversized streams',async()=>{
  await assert.rejects(readAIInput(new Request('https://test.local',{method:'POST',headers:{'content-length':String(AI_REQUEST_LIMIT+1)},body:'{}'})),e=>e.code==='REQUEST_TOO_LARGE'&&e.status===413);
  let cancelled=false;
  const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(AI_REQUEST_LIMIT));controller.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});
  await assert.rejects(readAIInput(new Request('https://test.local',{method:'POST',body,duplex:'half'})),e=>e.code==='REQUEST_TOO_LARGE');
  assert.equal(cancelled,true);
  await assert.rejects(readAIInput(new Request('https://test.local',{method:'POST',body:'invalid'})),e=>e.code==='INVALID_REQUEST');
});
