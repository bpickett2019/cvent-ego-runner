import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {eventLocationPlan,eventLocationProgram} from '../app/event-location.mjs';
import {SteelEgoHost} from '../ego-bridge/host.mjs';

const id='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const name='User-selected Conference';
const list='https://app.cvent.com/Subscribers/Events2/EventSelection';
const runtime={ownership:'LOCATING',activeTargetId:'assigned',expectedEventName:name,apiEvent:{id,name}};
const observation={info:{url:list},snapshot:'Events Create event Search',eventNames:[]};
const destination=`https://app.cvent.com/Subscribers/Events2/Details/EventDetails/Index?evtstub=${id}`;

test('location derives dynamic event route from unique API selection and supports neutral list or same event',()=>{
  assert.deepEqual(eventLocationPlan(runtime,observation),{id,name,destination});
  for(const url of [destination,`https://events.app.cvent.com/events/home?evtstub=${id}`,`https://app.cvent.com/Subscribers/Events2/RegistrationOption/RegistrationProcessPages/Index/?evtstub=${id}`]) {
    assert.equal(eventLocationPlan(runtime,{...observation,info:{url}}).destination,destination);
  }
  const next={...runtime,apiEvent:{id:other,name}};
  assert.equal(eventLocationPlan(next,observation).id,other);
});

test('same-event Registration Overview is a narrow return source, not a general Cvent host grant',()=>{
  const url=`https://event-insights-ui.app.cvent.com/events/registrationInsights/registrationOverview?evtstub=${id}`;
  assert.equal(eventLocationPlan(runtime,{...observation,info:{url}}).destination,destination);
  for(const denied of [url.replace(id,other),url+`&evtstub=${id}`,url+'&extra=1',url+'#other',url.replace('https:','http:'),url.replace('https://','https://user:pass@'),url.replace('.com/','.com.evil.test/'),url.replace('registrationOverview','edit'),url.replace('registrationOverview','login'),url.replace('.com/','.com:444/')]) {
    assert.throws(()=>eventLocationPlan(runtime,{...observation,info:{url:denied}}),/another event|ambiguous/,denied);
  }
});

test('location refuses login, ambiguous sources, foreign event, changed selection and invalid API identities',()=>{
  for(const url of [destination.replace(id,other),list+`?evtstub=${other}`,list+'?search=x','https://login.app.cvent.com/login','about:blank','https://example.com',destination+`&evtstub=${other}`]) {
    assert.throws(()=>eventLocationPlan(runtime,{...observation,info:{url}}),/another event|ambiguous/);
  }
  for(const snapshot of ['Sign in Password','Verification code','You are about to be logged out due to inactivity.'])assert.throws(()=>eventLocationPlan(runtime,{...observation,snapshot}),/human login/);
  for(const patch of [{apiEvent:null},{apiEvent:{id:'not-a-uuid',name}},{apiEvent:{id,name:'Different'}},{expectedEvtstub:other}])assert.throws(()=>eventLocationPlan({...runtime,...patch},observation),/API-confirmed|identity changed/);
});

test('restricted LOCATING grants v2 selection/navigation, never input, authoring, claim or foreign-event recovery',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ego-locate-'));
  const path=join(dir,'runtime.json');
  await writeFile(path,JSON.stringify({...runtime,expectedEvtstub:id}));
  let url=list;
  const client={setExternalSink(){},async request(method){return method==='Target.getTargets'?{targetInfos:[{type:'page',targetId:'assigned',url}]}:{result:{value:'Save'}};}};
  const host=new SteelEgoHost(client,path);
  await host.useTaskSpace(1246080070);
  assert.equal((await host.listTaskSpaces()).taskSpaces[0].ownership,'agent');
  assert.equal((await host.listTabs()).tabs[0].targetId,'assigned');
  await host.assertOperationAllowed({method:'Page.navigate',params:{url:destination}});
  for(const envelope of [
    {method:'Page.reload'},
    {method:'Input.dispatchMouseEvent',params:{x:10,y:10}},
    {method:'Input.insertText',params:{text:'data'}},
    {method:'Runtime.evaluate',params:{expression:'document.querySelector("button").click()'}},
    {method:'Page.navigate',params:{url:destination.replace(id,other)}},
    {method:'Page.navigate',params:{url:`https://app.cvent.com/edit?evtstub=${id}`}},
  ])await assert.rejects(host.assertOperationAllowed(envelope),/event location permits only/);
  await assert.rejects(host.claimTaskSpace(1246080070),/Return to Agent/);
  await assert.rejects(host.takeOverTaskSpace(),/Return to Agent/);
  url=`https://event-insights-ui.app.cvent.com/events/registrationInsights/registrationOverview?evtstub=${id}`;
  await host.assertOperationAllowed({method:'Page.navigate',params:{url:destination}});
  await assert.rejects(host.assertOperationAllowed({method:'Input.insertText',params:{text:'edit'}}),/event location permits only/);
  await assert.rejects(host.assertOperationAllowed({method:'Page.navigate',params:{url}}),/event location permits only/);
  url=destination.replace(id,other);
  await assert.rejects(host.assertOperationAllowed({method:'Page.navigate',params:{url:destination}}),/event location permits only/);
  url=list;
  await writeFile(join(dir,'api-write-uncertain.json'),'{}');
  await assert.rejects(host.assertOperationAllowed({method:'Page.navigate',params:{url:destination}}),/uncertain/);
  assert.equal(JSON.parse(await readFile(path)).ownership,'LOCATING');
  await writeFile(path,JSON.stringify({...runtime,expectedEvtstub:id,ownership:'USER'}));
  await assert.rejects(host.assertOperationAllowed({method:'Page.navigate',params:{url:destination}}),/User owns/);
});

test('event location executes actual v2 Page interface, waits, then returns strict observation JSON',async()=>{
  const calls=[];
  const page={
    async goto(url){calls.push(['goto',url]);},
    async waitForURL(url){calls.push(['waitForURL',url]);},
    async waitForFunction(){calls.push(['waitForFunction']);},
  };
  const task={async tabs(){return [{active:true,page:'unmanaged'}];},async adopt(value){assert.equal(value,'unmanaged');calls.push(['adopt']);return page;}};
  const program=eventLocationProgram(eventLocationPlan(runtime,observation));
  const output=[];
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction('taskSpace','js','pageInfo','snapshotText','cliLog',program)(
    async name=>{assert.equal(name,'cvent-ego-runner');return task;},
    async()=>[name],async()=>({url:destination}),async()=>'Event Details Registration',value=>output.push(value),
  );
  assert.deepEqual(calls.map(call=>call[0]),['adopt','goto','waitForURL','waitForFunction']);
  assert.equal(calls[1][1],destination);
  assert.deepEqual(JSON.parse(output[0]).eventNames,[name]);
  assert.doesNotMatch(program,/claimTaskSpace|takeOverTaskSpace|newPage|\.click\(|\.fill\(/);
});

test('UI no longer asks user to open the selected event and authoring remains disabled during location',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(html,/agent reads your exact workbook for the named target/);
  assert.doesNotMatch(js,/Open this (?:same )?event in Steel|Log in and navigate to the target event/);
  assert.doesNotMatch(html,/id="lockTarget"/);
  assert.match(js,/\/api\/jobs\/\$\{jobId\}\/read/);
  assert.doesNotMatch(js,/\/start/,'UI never bypasses local intake for authoring');
});
