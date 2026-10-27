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
let route, promptCount=0, created=0, cancelCount=0, workspaceCreates=0;
const workspaces = [{id:'ws-existing',title:'Codex 工作区',path:root}];
const sessionAgents = new Map();
const directories = new WeakMap();
const otherDirectory = join(process.env.DSH_HOME, 'other-project');
await mkdir(otherDirectory, {recursive:true});
const ctx = {
  effect(fn) { const result=fn(); if(typeof result === 'function') disposers.push(result); },
  connection:{fetch:{register(r){route=r;return ()=>{};}}},
  logger:{warn:console.error},
  workspaceRegistry:{
    list(){return workspaces;},
    get(id){return workspaces.find(item=>item.id===id);},
    async create(path,title){
      workspaceCreates++;
      const workspace={id:'ws-'+workspaceCreates,path,title};
      workspaces.push(workspace);return workspace;
    }
  },
  workingDirectory:{
    get(session){return directories.get(session) || session.header.cwd;},
    async set(agent,cwd){directories.set(agent.session,cwd);return cwd;}
  },
  agents:{},
  sessionController:{
    async create({workspaceId}){
      created++;
      const workspace=ctx.workspaceRegistry.get(workspaceId);
      assert.ok(workspace);
      const sessionId='session-mock-'+created;
      sessionAgents.set(sessionId,{status:'idle',session:{header:{cwd:workspace.path}},workspaceId});
      return {sessionId};
    },
    async resolveAgent(id){return {agent:sessionAgents.get(id)};},
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
 const firstSession=result.sessionId;
 assert.equal(workspaceCreates,0);assert.equal(workspaces.length,1);
 result=await runDesktop({prompt:'other project',cwd:otherDirectory,timeoutMs:5000});
 assert.equal(result.ok,true);assert.notEqual(result.sessionId,firstSession);
 const otherSession=result.sessionId;
 assert.equal(created,2);assert.equal(workspaceCreates,0);
 const otherAgent=sessionAgents.get(otherSession);
 assert.equal(otherAgent.workspaceId,'ws-existing');
 assert.equal(otherAgent.session.header.cwd,root);
 assert.equal(ctx.workingDirectory.get(otherAgent.session),otherDirectory);
 result=await runDesktop({prompt:'resume',cwd:otherDirectory,sessionId:otherSession,timeoutMs:5000});
 assert.equal(result.ok,true);assert.equal(created,2);
 const beforeWrongDirectory=promptCount;
 result=await runDesktop({prompt:'wrong cwd',cwd:root,sessionId:otherSession,timeoutMs:5000});
 assert.equal(result.ok,false);assert.match(result.error,/cwd differs/);assert.equal(promptCount,beforeWrongDirectory);
 const agent=sessionAgents.get(firstSession);
 agent.status='running';
 result=await runDesktop({prompt:'busy',sessionId:firstSession,timeoutMs:5000});
 assert.equal(result.ok,false);assert.match(result.error,/busy/);assert.equal(promptCount,beforeWrongDirectory);
 agent.status='idle';
 result=await runDesktop({prompt:'hang',sessionId:firstSession,timeoutMs:1000});
 assert.equal(result.ok,false);assert.match(result.error,/timed out/);assert.equal(cancelCount,1);
 // Reload with a renamed workspace: the durable ID still selects the same one.
 for(const dispose of disposers.splice(0).reverse()) await dispose();
 workspaces[0].title='Renamed Codex';
 await apply(ctx);await sleep(1700);
 result=await runDesktop({prompt:'after reload',cwd:otherDirectory,timeoutMs:5000});
 assert.equal(result.ok,true);assert.equal(workspaceCreates,0);assert.equal(created,3);
 assert.equal(sessionAgents.get(result.sessionId).workspaceId,'ws-existing');
 assert.equal(JSON.parse(await readFile(join(process.env.DSH_HOME,'codex-desktop-bridge','workspace.json'),'utf8')).workspaceId,'ws-existing');
 // If the user removes that workspace, create one replacement and reuse it.
 workspaces.splice(0);
 result=await runDesktop({prompt:'replacement',cwd:root,timeoutMs:5000});
 assert.equal(result.ok,true);assert.equal(workspaceCreates,1);assert.equal(workspaces.length,1);
 result=await runDesktop({prompt:'reuse replacement',cwd:otherDirectory,timeoutMs:5000});
 assert.equal(result.ok,true);assert.equal(workspaceCreates,1);assert.equal(created,5);
 console.log('PASS: shared workspace adoption, new sessions, per-session cwd, reload, replacement, resume, busy refusal, timeout cancellation');
} finally {clearInterval(timer);for(const dispose of disposers.reverse()) await dispose();}


