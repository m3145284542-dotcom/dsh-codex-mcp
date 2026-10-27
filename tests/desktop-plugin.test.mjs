import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.env.DSH_HOME = join(tmpdir(), 'dsh-desktop-bridge-test-' + Date.now());
const { apply } = await import(pathToFileURL(root + '/desktop-plugin/index.mjs'));
const { runDesktop } = await import(pathToFileURL(root + '/desktop-client.mjs'));
const events = new EventEmitter();
const disposers = [];
let route, promptCount=0, created=0, cancelCount=0;
const agent = {status:'idle',session:{header:{cwd:root}}};
const ctx = {
  effect(fn) { const result=fn(); if(typeof result === 'function') disposers.push(result); },
  connection:{fetch:{register(r){route=r;return ()=>{};}}},
  logger:{warn:console.error},
  workspaceRegistry:{async create(){return {id:'ws-test'};}},
  agents:{},
  sessionController:{
    async create(){created++;return {sessionId:'session-mock'};},
    async resolveAgent(){return {agent};},
    async prompt(request){
      promptCount++;
      if(request.content[0].text==='hang') return {accepted:true};
      setTimeout(()=>{
        events.emit('session/event',{id:request.sessionId},{type:'turn/start',data:{turn:promptCount}});
        events.emit('session/event',{id:request.sessionId},{type:'assistant/message',data:{turn:promptCount,message:{content:[{type:'text',text:'VISIBLE OK'}]}}});
        events.emit('session/event',{id:request.sessionId},{type:'turn/end',data:{turn:promptCount,reason:{kind:'completed'}}});
      },20);
      return {accepted:true};
    },
    cancel(){cancelCount++;}
  },
  on(name,fn){events.on(name,fn);return ()=>events.off(name,fn);}
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await apply(ctx);
let pollBusy=false;
const timer=setInterval(async()=>{
 if(pollBusy)return;pollBusy=true;
 try {
 const response=await route.fetch(new Request('http://local/api/codex-desktop-bridge/navigation'));
 const nav=await response.json();
 if(nav.requestId) await route.fetch(new Request('http://local/api/codex-desktop-bridge/navigation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:nav.requestId})}));
 }finally{pollBusy=false;}
},50);
try {
 await sleep(1700);
 let result=await runDesktop({prompt:'test',cwd:root,timeoutMs:5000});
 assert.equal(result.ok,true);assert.equal(result.text,'VISIBLE OK');assert.equal(created,1);
 result=await runDesktop({prompt:'resume',cwd:root,sessionId:'session-mock',timeoutMs:5000});
 assert.equal(result.ok,true);assert.equal(created,1);assert.equal(promptCount,2);
 agent.status='running';
 result=await runDesktop({prompt:'busy',sessionId:'session-mock',timeoutMs:5000});
 assert.equal(result.ok,false);assert.match(result.error,/busy/);assert.equal(promptCount,2);
 agent.status='idle';
 result=await runDesktop({prompt:'hang',sessionId:'session-mock',timeoutMs:1000});
 assert.equal(result.ok,false);assert.match(result.error,/timed out/);assert.equal(cancelCount,1);
 console.log('PASS: desktop navigation admission, task result, resume, busy refusal, timeout cancellation');
} finally {clearInterval(timer);for(const dispose of disposers.reverse()) await dispose();}
