import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { revokeJobBrowser, transitionBrowser } from '../app/browser-ownership.mjs';

function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'browser-stop-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const workspace=join(root,'job'),current=join(root,'data/current/runtime.json');
  mkdirSync(workspace);mkdirSync(join(root,'data/current'),{recursive:true});
  const runtime={runtimeId:'job',jobId:'job',steelSessionId:'session',activeTargetId:'page',ownership:'AGENT',securityAcknowledgedJobs:['incident']};
  const record={id:'job',workspace,browser:{runtimeId:'job',steelSessionId:'session',activeTargetId:'page'}};
  const save=(p,v)=>writeFileSync(p,JSON.stringify(v)), read=p=>JSON.parse(readFileSync(p,'utf8'));
  save(join(workspace,'runtime.json'),runtime);save(current,runtime);
  return {root,workspace,current,runtime,record,save,read};
}
test('Stop revokes matching job/shared runtime while preserving identity and incident acknowledgment',t=>{
  const f=fixture(t);assert.deepEqual(revokeJobBrowser(f.root,f.record),[]);
  assert.deepEqual(f.read(f.current),{...f.runtime,ownership:'USER'});
  assert.equal(f.read(join(f.workspace,'runtime.json')).ownership,'USER');
  assert.throws(()=>transitionBrowser(f.current,f.runtime,['RETURNING','LOCATING'],{ownership:'AGENT'}),/ownership changed/);
  assert.throws(()=>transitionBrowser(f.current,f.runtime,['USER'],{ownership:'AGENT'},()=>true),/cancelled/);
});
test('Stop and stale handoff never modify a replacement browser',t=>{
  const f=fixture(t),replacement={...f.runtime,steelSessionId:'different'};f.save(f.current,replacement);
  assert.deepEqual(revokeJobBrowser(f.root,f.record),[]);assert.deepEqual(f.read(f.current),replacement);
  assert.throws(()=>transitionBrowser(f.current,f.runtime,['AGENT'],{ownership:'USER'}),/changed/);
});
test('Stop revokes a newly assigned provisioning browser before the job copy has identity',t=>{
  const f=fixture(t);delete f.record.browser;f.save(join(f.workspace,'runtime.json'),{ownership:'USER'});
  assert.deepEqual(revokeJobBrowser(f.root,f.record),[]);assert.equal(f.read(f.current).ownership,'USER');
});
test('job revocation failure does not skip revoking the matching shared browser',t=>{
  const f=fixture(t);writeFileSync(join(f.workspace,'runtime.json'),'broken');
  assert.equal(revokeJobBrowser(f.root,f.record).length,1);assert.equal(f.read(f.current).ownership,'USER');
});
