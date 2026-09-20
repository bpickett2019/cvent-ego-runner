import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { stopJobBrowser, provisionCleanBrowser } from '../app/clean-browser.mjs';
const image='sha256:21cf2a5785aa9478d0f7933c04bce96ca79f3d7a93d9824ea184800d29d3cd02';
async function setup(t) {
  const root=await mkdtemp(join(tmpdir(),'steel-cleanup-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const id=randomUUID(),record={id,workspace:join(root,'data/jobs',id)},container=`cvent-build-${id}`,profile=join(root,'data/browser-profiles',id);
  await mkdir(join(record.workspace,'receipts'),{recursive:true});await mkdir(profile,{recursive:true});
  await writeFile(join(profile,'kept'),'profile');await writeFile(join(record.workspace,'original.xlsx'),'original');
  await writeFile(join(record.workspace,'receipts/clean-browser.json'),JSON.stringify({jobId:id,container,profile,image}));
  const info={Id:'a'.repeat(64),Name:`/${container}`,Image:image,Config:{Labels:{'cvent.runner.job':id}},State:{Running:true,Pid:123}};
  const calls=[];let fail=false,absent=false,noStop=false;
  const run=async args=>{calls.push(args);if(fail)throw new Error('Docker unavailable');
    if(args[0]==='ps')return absent?'':info.Id;
    if(args[0]==='inspect')return JSON.stringify([info]);
    if(args[0]==='stop'){if(!noStop)info.State={Running:false,Pid:0};return info.Id;}
    throw new Error('Unexpected destructive command');};
  return {root,record,info,calls,run,profile,fail:()=>fail=true,absent:()=>absent=true,noStop:()=>noStop=true,
    receipt:async()=>JSON.parse(await readFile(join(record.workspace,'receipts/steel-cleanup.json'),'utf8'))};
}
test('cleanup stops only the immutable owned container ID, verifies exit and preserves profiles/evidence',async t=>{
  const f=await setup(t);await stopJobBrowser(f);await stopJobBrowser(f);
  assert.deepEqual(f.calls.filter(a=>a[0]==='stop'),[['stop','--time','10',f.info.Id]]);
  assert.equal((await f.receipt()).status,'STOPPED');assert.equal(await readFile(join(f.profile,'kept'),'utf8'),'profile');
  assert.equal(await readFile(join(f.record.workspace,'original.xlsx'),'utf8'),'original');
});
test('cleanup refuses foreign container labels, names, images and invalid IDs',async t=>{
  for(const mode of ['label','name','image','id'])await t.test(mode,async t=>{
    const f=await setup(t);
    if(mode==='label')f.info.Config.Labels['cvent.runner.job']=randomUUID();
    if(mode==='name')f.info.Name='/someone-else';if(mode==='image')f.info.Image='other';if(mode==='id')f.info.Id='invalid';
    await assert.rejects(stopJobBrowser(f),/identity mismatch/);assert(!f.calls.some(a=>a[0]==='stop'));assert.equal((await f.receipt()).status,'FAILED');
  });
});
test('Docker failure and unconfirmed termination cannot be recorded as stopped',async t=>{
  for(const mode of ['unavailable','still-running'])await t.test(mode,async t=>{
    const f=await setup(t);if(mode==='unavailable')f.fail();else f.noStop();
    await assert.rejects(stopJobBrowser(f));assert.equal((await f.receipt()).status,'FAILED');
  });
});
test('missing container is harmless; absent creation receipt never invokes Docker',async t=>{
  const f=await setup(t);f.absent();await stopJobBrowser(f);assert.equal((await f.receipt()).status,'STOPPED');
  await rm(join(f.record.workspace,'receipts/clean-browser.json'));f.calls.length=0;await stopJobBrowser(f);assert.deepEqual(f.calls,[]);
});
test('readiness failure and cancellation after creation terminate Steel while retaining the new profile',async t=>{
  for(const cancelled of [false,true])await t.test(String(cancelled),async t=>{
    const f=await setup(t);await rm(f.profile,{recursive:true});let created=false;
    f.info.NetworkSettings={Ports:{'3000/tcp':[{HostIp:'127.0.0.1',HostPort:'45000'}],'9223/tcp':[{HostIp:'127.0.0.1',HostPort:'45001'}]}};
    const run=async args=>{if(args[0]==='run'){created=true;return f.info.Id;}return f.run(args);};
    await assert.rejects(provisionCleanBrowser({...f,run,cancelled:()=>cancelled&&created,attempts:1,fetchJson:async()=>{throw new Error('not ready');}}),/cancelled|not become ready/);
    assert.equal((await f.receipt()).status,'STOPPED');assert.equal(f.info.State.Running,false);
    assert.equal(JSON.parse(await readFile(join(f.record.workspace,'receipts/clean-browser.json'),'utf8')).status,'FAILED');
  });
});
