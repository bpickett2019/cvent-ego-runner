import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mountRR } from '../app/rr-connection.mjs';

test('there is one prompt site and no paid intake, prepared-session pool or continuation branch', async () => {
  const source = await readFile(new URL('../app/rr-connection.mjs', import.meta.url), 'utf8');
  assert.equal((source.match(/type: "prompt"/g) || []).length, 1);
  assert.doesNotMatch(source, /promptReading|configureFromIntake|settleIntake|sameIdleSession|releasePrepared|rr-first|intake\.json|fresh-on-upload/);
  assert.throws(() => mountRR(express(), {root:'/unused'}), /Login-first/);
});

test('upload accepts only a workbook and explicit target, with fixed scope and zero AI', async t => {
  const root = await mkdtemp(join(tmpdir(), 'thin-upload-'));
  const app = express(); app.use(express.json());
  let launches = 0;
  const connection = mountRR(app, {root, provisionBrowser:async()=>{}, prepareTarget:async()=>{}, verifyLogin:async()=>{}, rpcFactory:()=>{launches++;throw new Error('No launch permitted');}});
  const server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await connection.shutdown();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
  const upload = async fields => {
    const form = new FormData(); form.append('rr',new Blob(['original']),'RR.xlsx');
    for(const [key,value] of Object.entries(fields)) form.append(key,value);
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/jobs`,{method:'POST',body:form});
    return {status:result.status,body:await result.json()};
  };
  for(const fields of [{}, {eventName:''}, {eventName:'https://app.cvent.com/'}, ...['instruction','approvedSow','allowanceUSD','externalCostReserveUSD'].map(key=>({eventName:'Target',[key]:'override'}))]) {
    assert.equal((await upload(fields)).status,409);
    assert.deepEqual(await readdir(join(root,'data/jobs')),[]);
  }
  const result = await upload({eventName:'Target'});
  assert.equal(result.status,201); assert.equal(result.body.workflow,'login-first');
  assert.equal(result.body.sessionId,undefined); assert.equal(result.body.piCostUSD,0);
  assert.equal(await readFile(result.body.workbook,'utf8'),'original'); assert.equal(launches,0);
});
