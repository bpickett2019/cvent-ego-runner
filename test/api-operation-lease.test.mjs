import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, rename, symlink, link, chmod } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireApiLease, apiOperationBlocked, API_GUARD_FILE } from '../app/api-operation-lease.mjs';

const cleanups = new Map();
async function directory(t) {
  const dir = await mkdtemp(join(tmpdir(), 'api-flock-test-')); cleanups.set(dir, []);
  t.after(async () => { for (const cleanup of cleanups.get(dir)) await cleanup(); await rm(dir, { recursive: true, force: true }); cleanups.delete(dir); });
  return dir;
}
async function owner(t, dir, inherit = false) {
  const program = `
    import { spawn, spawnSync } from 'node:child_process';
    import { acquireApiLease } from ${JSON.stringify(new URL('../app/api-operation-lease.mjs', import.meta.url).href)};
    let descriptor;
    const lease=acquireApiLease(process.argv[1],{run:(...args)=>{descriptor=args[2].stdio[3];return spawnSync(...args);}});
    if(${inherit}){
      const survivor=spawn(process.execPath,['--input-type=module','-e',
        "import {existsSync,fstatSync} from 'node:fs';fstatSync(3);console.log('INHERITED');setInterval(()=>{if(existsSync(process.argv[1]+'/release-survivor'))process.exit(0);},20);setTimeout(()=>process.exit(0),10000);",process.argv[1]],
        {env:{PATH:process.env.PATH},stdio:['ignore','pipe','ignore',descriptor]});
      survivor.stdout.once('data',()=>console.log('OWNED'));
    }else console.log('OWNED');
    setInterval(()=>{},1000);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', program, dir], {
    env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  cleanups.get(dir).push(async () => {
    await writeFile(join(dir, 'release-survivor'), '');
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    if (inherit) await waitReleased(dir);
  });
  let errors='';child.stderr.on('data', c=>errors+=c);
  const ready = await Promise.race([once(child.stdout,'data').then(([bytes])=>bytes.toString().trim()), exited.then(()=>`EXIT ${errors}`)]);
  assert.equal(ready,'OWNED'); return {child,exited};
}
async function waitReleased(dir) {
  for(let n=0;n<60;n++){
    if(!apiOperationBlocked(dir))return;
    await new Promise(r=>setTimeout(r,25));
  }
  assert.fail('Owned test lease did not release');
}

test('persistent guard is free when unheld; inspection never creates or removes files',async t=>{
  const dir=await directory(t);assert.equal(apiOperationBlocked(dir),false);assert.deepEqual(await readdir(dir),[]);
  const lease=acquireApiLease(dir),before=statSync(join(dir,API_GUARD_FILE));
  assert.equal(apiOperationBlocked(dir),true,'parent Node retains lock after Python exits');
  assert.throws(()=>acquireApiLease(dir),/ownership/);
  lease.assertOwned();lease.release();lease.release();assert.throws(()=>lease.assertOwned(),/ownership/);
  assert.equal(apiOperationBlocked(dir),false);assert.equal(statSync(join(dir,API_GUARD_FILE)).ino,before.ino);
  assert.equal(await readFile(join(dir,API_GUARD_FILE),'utf8'),'');
});

test('kernel releases ownership after SIGKILL without finally, file deletion, timeout expiry or PID inference',async t=>{
  const dir=await directory(t),running=await owner(t,dir),before=statSync(join(dir,API_GUARD_FILE));
  assert.equal(apiOperationBlocked(dir),true);running.child.kill('SIGKILL');await running.exited;
  await waitReleased(dir);assert.equal(statSync(join(dir,API_GUARD_FILE)).ino,before.ino);
  const next=acquireApiLease(dir);next.release();
});

test('a surviving inherited descriptor keeps ownership after its original process dies',async t=>{
  const dir=await directory(t),running=await owner(t,dir,true);
  assert.equal(apiOperationBlocked(dir),true);running.child.kill('SIGKILL');await running.exited;
  assert.equal(apiOperationBlocked(dir),true,'no parent-PID-only clearance');
  await writeFile(join(dir,'release-survivor'),'');await waitReleased(dir);
});

test('legacy markers including dangling links stay blocked and byte-preserved',async t=>{
  const dir=await directory(t),path=join(dir,'api-operation.lock');
  await writeFile(path,'{"pid":123,"operation":"listDiscounts","receiptId":"legacy"}');
  const before=await readFile(path);assert.equal(apiOperationBlocked(dir),true);assert.throws(()=>acquireApiLease(dir),/Legacy/);
  assert.deepEqual(await readFile(path),before);assert.deepEqual(await readdir(dir),['api-operation.lock']);
  await rm(path);await symlink(join(dir,'absent'),path);assert.equal(apiOperationBlocked(dir),true);
});

for(const mode of ['symlink','hardlink','nonempty','permissions'])test(`invalid ${mode} guard fails closed without replacement`,async t=>{
  const dir=await directory(t),path=join(dir,API_GUARD_FILE),other=join(dir,'other');
  if(mode==='symlink')await symlink(other,path);
  else {await writeFile(path,mode==='nonempty'?'unknown format':'',{mode:0o600});if(mode==='hardlink')await link(path,other);if(mode==='permissions')await chmod(path,0o644);}
  assert.equal(apiOperationBlocked(dir),true);assert.throws(()=>acquireApiLease(dir),/ownership/);
});

test('a replaced pathname is rejected by its owner; release never removes the replacement',async t=>{
  const dir=await directory(t),lease=acquireApiLease(dir),path=join(dir,API_GUARD_FILE);
  await rename(path,join(dir,'original-guard'));await writeFile(path,'foreign replacement',{mode:0o600});
  assert.throws(()=>lease.assertOwned(),/ownership/);lease.release();assert.equal(await readFile(path,'utf8'),'foreign replacement');
  assert.equal(apiOperationBlocked(dir),true);
});

test('failed capability checks release descriptors but report unknown inspection as blocked',async t=>{
  const dir=await directory(t);
  const unavailable=()=>({status:74,stdout:''});
  assert.throws(()=>acquireApiLease(dir,{run:unavailable}),/ownership/);
  assert.equal(apiOperationBlocked(dir,{run:unavailable}),true);
  assert.equal(apiOperationBlocked(dir),false);
  assert.throws(()=>acquireApiLease(dir,{run:(...args)=>{spawnSync(...args);return {status:0,stdout:'wrong protocol'};}}),/ownership/);
  assert.equal(apiOperationBlocked(dir),false,'failed handshake does not leak the acquired fd');
});

test('different workspaces have independent guard inodes',async t=>{
  const a=await directory(t),b=await directory(t),lease=acquireApiLease(a);
  assert.equal(apiOperationBlocked(a),true);assert.equal(apiOperationBlocked(b),false);
  const other=acquireApiLease(b);other.release();lease.release();
});
