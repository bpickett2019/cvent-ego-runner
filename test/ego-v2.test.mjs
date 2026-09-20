import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SteelEgoHost } from '../ego-bridge/host.mjs';
import { PageLedgerStore, runtimeInstanceId } from '../vendor/ego-lite/package/ego-browser/dist/src/page-ledger.js';

async function fixture(ownership = 'AGENT') {
  const dir = await mkdtemp(join(tmpdir(), 'ego-v2-'));
  const path = join(dir, 'runtime.json');
  await writeFile(path, JSON.stringify({ownership, activeTargetId:'assigned'}));
  const client = { setExternalSink() {}, async request(method) {
    if (method === 'Target.getTargets') return {targetInfos:[
      {type:'page',targetId:'assigned',url:'https://example.com'},
      {type:'page',targetId:'other',url:'https://example.org'},
    ]};
    return {};
  }};
  return {host:new SteelEgoHost(client,path),path,dir,client};
}

test('exact v2 skill and API reference are pinned to upstream', async () => {
  for(const file of ['SKILL.md','references/api.md']) {
    const local = await readFile(new URL(`../.pi/skills/ego-browser/${file}`, import.meta.url),'utf8');
    const upstream = await readFile(new URL(`../vendor/ego-lite/skills/ego-browser/${file}`, import.meta.url),'utf8');
    assert.equal(local,upstream);
    if(file === 'SKILL.md') assert.match(local,/version: "2\.0\.0"/);
  }
});

test('assigned TaskSpace is stable and cannot create or select another space', async () => {
  const {host} = await fixture();
  const space = (await host.listTaskSpaces()).taskSpaces[0];
  assert.equal(space.id,1246080070);
  await host.useTaskSpace(space.id);
  await assert.rejects(host.useTaskSpace(7),/Unassigned/);
  await assert.rejects(host.createTaskSpace('replacement'),/creating another space is forbidden/);
});

test('claim/takeover cannot bypass USER or RETURNING ownership gates', async () => {
  for(const ownership of ['USER','RETURNING']) {
    const {host,path} = await fixture(ownership);
    await assert.rejects(host.claimTaskSpace(1246080070),/Return to Agent/);
    await assert.rejects(host.takeOverTaskSpace(),/Return to Agent/);
    assert.equal(JSON.parse(await readFile(path)).ownership,ownership);
  }
});

test('Return preflight can read assigned inventory but cannot acquire control or mutate', async () => {
  const {host,path} = await fixture('RETURNING');
  assert.deepEqual((await host.listTabs()).tabs.map(tab=>tab.targetId),['assigned']);
  await host.assertOperationAllowed({method:'Runtime.evaluate',params:{expression:'document.title'}});
  await assert.rejects(host.useTaskSpace(1246080070),/Return to Agent/);
  for(const envelope of [
    {method:'Input.dispatchKeyEvent',params:{key:'A'}},
    {method:'Page.navigate',params:{url:'https://example.com'}},
    {method:'Runtime.evaluate',params:{expression:'document.querySelector("button").click()'}},
  ]) await assert.rejects(host.assertOperationAllowed(envelope),/read-only while returning/);
  assert.equal(JSON.parse(await readFile(path)).ownership,'RETURNING');
  const source = await readFile(new URL('../app/server.mjs', import.meta.url),'utf8');
  const observation = source.slice(source.indexOf('async function observe()'),source.indexOf('async function verifyLogin('));
  assert.doesNotMatch(observation,/await (?:useOrCreateTaskSpace|taskSpace|claimTaskSpace|takeOverTaskSpace)\(/);
  const {host:userHost} = await fixture('USER');
  await assert.rejects(userHost.listTabs(),/Return to Agent/);
});

test('inventory exposes only assigned tab and refuses missing target fallback', async () => {
  const {host,path} = await fixture();
  assert.deepEqual((await host.listTabs()).tabs.map(tab=>tab.targetId),['assigned']);
  await writeFile(path,JSON.stringify({ownership:'AGENT',activeTargetId:'missing'}));
  await assert.rejects(host.activeTarget(),/Assigned page target is missing/);
});

test('tab deletion, creation, browser closure and foreign target access fail closed', async () => {
  const {host} = await fixture();
  for(const method of ['Target.closeTarget','Target.createTarget','Browser.close','Target.disposeBrowserContext']) {
    await assert.rejects(host.assertOperationAllowed({method,params:{targetId:'assigned'}}),/must be preserved/);
  }
  await assert.rejects(host.assertOperationAllowed({method:'Target.attachToTarget',params:{targetId:'other'}}),/unassigned browser target/);
});

test('Steel instance identity preserves labels across shell parent changes', async () => {
  const {dir} = await fixture();
  const previous = process.env.EGO_BROWSER_INSTANCE_ID;
  try {
    process.env.EGO_BROWSER_INSTANCE_ID = 'steel:test-session';
    assert.equal(runtimeInstanceId(10),runtimeInstanceId(20));
    const first = new PageLedgerStore({rootDir:join(dir,'state'),browserInstanceId:runtimeInstanceId(10)});
    const page = await first.addPage(1246080070,'assigned',{openedBy:'unknown'});
    const second = new PageLedgerStore({rootDir:join(dir,'state'),browserInstanceId:runtimeInstanceId(20)});
    assert.equal((await second.getPage(1246080070,page.label)).targetId,'assigned');
    process.env.EGO_BROWSER_INSTANCE_ID = 'steel:another-session';
    assert.notEqual(runtimeInstanceId(20),'steel:test-session');
  } finally {
    if(previous === undefined) delete process.env.EGO_BROWSER_INSTANCE_ID;
    else process.env.EGO_BROWSER_INSTANCE_ID = previous;
  }
});

test('snapshot scopes filter viewport and subtree without pretending to include iframe contents', async () => {
  const {host,client} = await fixture();
  const fallback = client.request;
  client.request = async (method,...args) => {
    if(method === 'Target.attachToTarget') return {sessionId:'s'};
    if(method === 'Accessibility.getFullAXTree') return {nodes:[
      {nodeId:'1',backendDOMNodeId:1,role:{value:'RootWebArea'},name:{value:'Test'},childIds:['2','3']},
      {nodeId:'2',parentId:'1',backendDOMNodeId:2,role:{value:'button'},name:{value:'Visible'}},
      {nodeId:'3',parentId:'1',backendDOMNodeId:3,role:{value:'button'},name:{value:'Below fold'}},
    ]};
    if(method === 'DOMSnapshot.captureSnapshot') return {strings:[],documents:[{nodes:{backendNodeId:[1,2,3]},layout:{nodeIndex:[0,1,2],bounds:[[0,0,100,2000],[0,0,20,20],[0,1000,20,20]]}}]};
    if(method === 'Runtime.evaluate') return {result:{value:{width:100,height:100,x:0,y:0}}};
    return fallback(method,...args);
  };
  const viewport = await host.snapshot({scope:'only_within_viewport'});
  assert.match(viewport.content,/Visible/);
  assert.doesNotMatch(viewport.content,/Below fold/);
  assert.match((await host.snapshot({scope:'full_page'})).content,/Below fold/);
  const subtree = await host.snapshot({scope:'subtree',root:3});
  assert.match(subtree.content,/Below fold/);
  assert.doesNotMatch(subtree.content,/Visible/);
  assert.match(subtree.content,/iframe contents not included/);
  await assert.rejects(host.snapshot({scope:'subtree',root:99}),/subtree unavailable/);
});
