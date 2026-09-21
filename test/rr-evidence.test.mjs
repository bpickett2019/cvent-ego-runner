import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, mkdir, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
const script = new URL('../app/rr-evidence.py',import.meta.url).pathname;
const eventId='11111111-1111-1111-1111-111111111111';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'rr-evidence-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'receipts'));
 execFileSync('python3',['-c',`from openpyxl import Workbook\nfrom openpyxl.comments import Comment\nimport sys\nw=Workbook();s=w.active;s.title='Arbitrary RR';s['A1']='Name';s['B1']='Code';s['A2']='Original';s['B2']='EXISTING';s['A3']='New';s['B3']='NEW';s['B4']=' existing ';s['B5']='=1+1';s['D2']='x'*10000;s['D2'].comment=Comment('important instruction','human');s['E2']='Link';s['E2'].hyperlink='https://example.com';s.merge_cells('A7:B7');w.create_sheet('Hidden').sheet_state='hidden';w.save(sys.argv[1])`,join(root,'original.xlsx')]);
 const original=await readFile(join(root,'original.xlsx'));const sha256=createHash('sha256').update(original).digest('hex');
 await writeFile(join(root,'job.json'),JSON.stringify({sha256,target:{apiEventId:eventId}}));
 const receipt={operation:'listDiscounts',eventId,route:'api',status:'PASS',startedAt:'2026-01-01',completedAt:'2026-01-01',result:[{id:'discount-1',code:'EXISTING',name:'Existing name',type:'DISCOUNT_CODE',event:{id:eventId}}]};
 await writeFile(join(root,'receipts/api-one.json'),JSON.stringify(receipt));
 const run=(...args)=>{const r=spawnSync('python3',[script,...args],{env:{...process.env,RR_WORKSPACE:root},encoding:'utf8'});return {...r,json:r.status===0?JSON.parse(r.stdout):JSON.parse(r.stderr.split('\n').filter(x=>x.startsWith('{')).at(-1))};};
 return {root,original,receipt,run};
}
test('evidence inventory preserves full cells, formulas, comments, links, hidden sheets and original bytes',async t=>{
 const f=await fixture(t),r=f.run('index','--limit','1');assert.equal(r.status,0,r.stderr);assert.equal(r.json.total,2);assert.equal(r.json.nextOffset,1);
 const payload=JSON.parse(await readFile(join(f.root,r.json.evidence)));
 assert.equal(payload.cells.find(c=>c.cell==='B5').value,'=1+1');assert.equal(payload.cells.find(c=>c.cell==='D2').comment,'important instruction');
 assert.equal(payload.cells.find(c=>c.cell==='E2').hyperlink,'https://example.com');assert.equal(payload.sheets[1].visibility,'hidden');assert.deepEqual(payload.sheets[0].mergedRanges,['A7:B7']);
 assert.deepEqual(await readFile(join(f.root,'original.xlsx')),f.original);assert.equal(f.run('index').json.evidence,r.json.evidence);
});
test('bounded cell views expose continuations and exact long-cell recovery rather than silent truncation',async t=>{
 const f=await fixture(t);let offset=0,seen=[];
 do {const r=f.run('cells','--sheet','Arbitrary RR','--offset',String(offset),'--limit','3');assert.equal(r.status,0,r.stderr);seen.push(...r.json.cells);offset=r.json.nextOffset;}while(offset!==null);
 assert.equal(new Set(seen.map(c=>c.source)).size,seen.length);assert.equal(seen.find(c=>c.source==='Arbitrary RR!D2').truncated,true);
 let text='',next=0;do{const r=f.run('cell','--sheet','Arbitrary RR','--cell','D2','--text-offset',String(next));assert.equal(r.status,0,r.stderr);text+=r.json.jsonText;next=r.json.nextTextOffset;}while(next!==null);
 const cell=JSON.parse(text);assert.equal(cell.value,'x'.repeat(10000));assert.equal(cell.comment,'important instruction');
 const filtered=f.run('cells','--sheet','Arbitrary RR','--query','important');assert.equal(filtered.json.filtered,true);assert.equal(filtered.json.cells.length,1);
});
test('identity comparison is compact but retains every matched row/ID and never implies satisfaction',async t=>{
 const f=await fixture(t),r=f.run('compare-codes','--sheet','Arbitrary RR','--start-row','2');assert.equal(r.status,0,r.stderr);
 assert.deepEqual(r.json.counts,{'existing-identity':1,'missing-identity':1,ambiguous:0,'formula-needs-review':1,'identity-difference':1,'fields-need-review':0});assert.equal(r.json.comparedRows,4);assert.ok(r.stdout.length<2500);
 const full=JSON.parse(await readFile(join(f.root,r.json.comparison)));assert.equal(full.rows.length,4);assert.ok(full.rows.every(x=>x.requirementsSatisfied===null));assert.equal(full.rows[0].matches[0].id,'discount-1');
 assert.match(full.notice,/missing is not creation approval/);assert.equal(full.rows[2].source,'Arbitrary RR!B4');
 assert.equal(full.rows[2].disposition,'identity-difference','normalized candidates never hide exact RR identity differences');
});
test('row patterns collapse repeated terms without dropping source mappings or treating bounds as consecutive rows',async t=>{
 const f=await fixture(t);
 execFileSync('python3',['-c',`from openpyxl import load_workbook\nimport sys\nw=load_workbook(sys.argv[1]);s=w['Arbitrary RR'];s['C2']='same';s['C3']='different';s['C4']='same';w.save(sys.argv[1])`,join(f.root,'original.xlsx')]);
 const job=JSON.parse(await readFile(join(f.root,'job.json')));job.sha256=createHash('sha256').update(await readFile(join(f.root,'original.xlsx'))).digest('hex');await writeFile(join(f.root,'job.json'),JSON.stringify(job));
 const r=f.run('patterns','--sheet','Arbitrary RR','--columns','C:C','--start-row','2','--limit','1');assert.equal(r.status,0,r.stderr);
 assert.equal(r.json.representedRows,3);assert.equal(r.json.total,2);assert.equal(r.json.nextOffset,1);assert.equal(r.json.patterns[0].rowCount,2);
 const full=JSON.parse(await readFile(join(f.root,r.json.evidence)));assert.deepEqual(full.patterns[0].rows,[2,4]);assert.equal(full.patterns[0].values.C.value,'same');assert.match(r.json.notice,/Only the selected columns/);
});
test('number formats distinguish percentage, currency and formula terms in patterns and previews',async t=>{
 const f=await fixture(t);
 execFileSync('python3',['-c',`from openpyxl import load_workbook\nimport sys\nw=load_workbook(sys.argv[1]);s=w['Arbitrary RR'];s['C2']=0.1;s['C2'].number_format='0%';s['C3']=0.1;s['C3'].number_format='$0.00';s['C4']='=1/10';s['C4'].number_format='0%';w.save(sys.argv[1])`,join(f.root,'original.xlsx')]);
 const job=JSON.parse(await readFile(join(f.root,'job.json')));job.sha256=createHash('sha256').update(await readFile(join(f.root,'original.xlsx'))).digest('hex');await writeFile(join(f.root,'job.json'),JSON.stringify(job));
 const r=f.run('patterns','--sheet','Arbitrary RR','--columns','C:C','--start-row','2');assert.equal(r.status,0,r.stderr);assert.equal(r.json.total,3);assert.equal(r.json.representedRows,3);
 assert.deepEqual(r.json.patterns.map(p=>p.values.C.numberFormat.value),['0%','$0.00','0%']);assert.equal(r.json.patterns[2].values.C.value,'=1/10');
 const cells=f.run('cells','--sheet','Arbitrary RR','--start-row','2','--end-row','2').json.cells;assert.equal(cells.find(c=>c.source.endsWith('!C2')).numberFormat.value,'0%');
 const full=JSON.parse(await readFile(join(f.root,r.json.evidence)));assert.equal(full.patterns[1].values.C.numberFormat,'$0.00');
});
test('catalog views are scoped, bounded and reject failed newer, foreign or malformed evidence',async t=>{
 const f=await fixture(t);const valid=f.run('catalog','--query','EXISTING');assert.equal(valid.status,0,valid.stderr);assert.equal(valid.json.items[0].id.value,'discount-1');assert.equal(valid.json.filtered,true);
 for(const change of [{status:'BLOCKED'},{eventId:'foreign'},{result:{}},{result:[{event:{id:'foreign'}}]}]){
  await writeFile(join(f.root,'receipts/api-two.json'),JSON.stringify({...f.receipt,...change,startedAt:'2026-02-01'}));assert.notEqual(f.run('catalog').status,0);
 }assert.notEqual(f.run('catalog','--operation','listQuestionChoices').status,0);assert.notEqual(f.run('catalog','--operation','listAttendees').status,0);
});
test('ambiguous identities are explicit and duplicated or missing saved IDs block comparison',async t=>{
 const f=await fixture(t);const row=f.receipt.result[0];
 await writeFile(join(f.root,'receipts/api-one.json'),JSON.stringify({...f.receipt,result:[row,{...row,id:'discount-2'}]}));
 assert.equal(f.run('compare-codes','--sheet','Arbitrary RR','--start-row','2').json.counts.ambiguous,2);
 for(const result of [[row,row],[{code:'X'}]]){await writeFile(join(f.root,'receipts/api-one.json'),JSON.stringify({...f.receipt,result}));assert.notEqual(f.run('compare-codes','--sheet','Arbitrary RR').status,0);}
});
test('checksum, artifact tampering, workspace symlinks and invalid bounds fail without rewriting originals',async t=>{
 const f=await fixture(t),index=f.run('index');
 for(const args of [['cells','--sheet','Missing'],['index','--offset','-1'],['index','--limit','100'],['cells','--sheet','Arbitrary RR','--start-row','9','--end-row','1']])assert.notEqual(f.run(...args).status,0);
 await writeFile(join(f.root,index.json.evidence),'tampered');assert.notEqual(f.run('index').status,0);
 await writeFile(join(f.root,'original.xlsx'),'changed');assert.notEqual(f.run('index').status,0);
 const h=await fixture(t);await rm(join(h.root,'receipts'),{recursive:true});await symlink(join(f.root,'receipts'),join(h.root,'receipts'));assert.notEqual(h.run('catalog').status,0);
 const g=await fixture(t);await symlink(tmpdir(),join(g.root,'evidence'));assert.notEqual(g.run('index').status,0);assert.deepEqual(await readFile(join(g.root,'original.xlsx')),g.original);
});

test('unchanged uploads reuse extraction without reopening Excel; changed source never reuses it',async t=>{
 const f=await fixture(t),first=f.run('index');assert.equal(first.status,0,first.stderr);
 const artifact=join(f.root,first.json.evidence),before=await readFile(artifact);
 const result=execFileSync('python3',['-c',`import runpy,sys,json\nfrom pathlib import Path\nsys.path.insert(0,str(Path(sys.argv[1]).parent))\nm=runpy.run_path(sys.argv[1]);fn=m['workbook']\ndef forbidden(*a,**k): raise AssertionError('Excel was parsed again')\nfn.__globals__['load_workbook']=forbidden\np=Path(sys.argv[2]).resolve();data,evidence=fn(p,json.loads((p/'job.json').read_text()));print(evidence)`,script,f.root],{encoding:'utf8'}).trim();
 assert.equal(result,first.json.evidence);
 execFileSync('python3',['-c',`from openpyxl import load_workbook\nimport sys\nw=load_workbook(sys.argv[1]);w.active['A2']='New RR value';w.save(sys.argv[1])`,join(f.root,'original.xlsx')]);
 assert.notEqual(f.run('index').status,0,'unchanged job hash refuses changed original');
 const job=JSON.parse(await readFile(join(f.root,'job.json')));job.sha256=createHash('sha256').update(await readFile(join(f.root,'original.xlsx'))).digest('hex');await writeFile(join(f.root,'job.json'),JSON.stringify(job));
 const next=f.run('index');assert.equal(next.status,0,next.stderr);assert.notEqual(next.json.evidence,first.json.evidence);
 assert.deepEqual(await readFile(artifact),before);
 const other=await fixture(t);assert.equal(other.run('index').status,0);assert.notEqual(other.root,f.root);
});
test('changing sheet names/layouts and visual styles remain source-addressed, not template-specific',async t=>{
 const f=await fixture(t);
 execFileSync('python3',['-c',`from openpyxl import Workbook\nfrom openpyxl.styles import Font,PatternFill\nfrom openpyxl.comments import Comment\nimport sys\nw=Workbook();s=w.active;s.title='طلبات 2027';s['H9']='0012';s['H9'].font=Font(strike=True,color='FF123456');s['H9'].fill=PatternFill('solid',fgColor='FFFFFF00');s['H9'].comment=Comment('Reference only, not a requested change','author');s['J13']='=1/10';s['J13'].number_format='0%';w.create_sheet('Extra guidance').sheet_state='hidden';w.save(sys.argv[1])`,join(f.root,'original.xlsx')]);
 const job=JSON.parse(await readFile(join(f.root,'job.json')));job.sha256=createHash('sha256').update(await readFile(join(f.root,'original.xlsx'))).digest('hex');await writeFile(join(f.root,'job.json'),JSON.stringify(job));
 const r=f.run('index');assert.equal(r.status,0,r.stderr);assert.equal(r.json.sheets[0].name,'طلبات 2027');assert.equal(r.json.sheets[1].visibility,'hidden');
 const full=JSON.parse(await readFile(join(f.root,r.json.evidence))),cell=full.cells.find(c=>c.cell==='H9');assert.equal(cell.value,'0012');
 assert.match(full.styles[cell.styleId].font,/strike/);assert.match(full.styles[cell.styleId].fill,/FFFFFF00/);
 assert.equal(full.cells.find(c=>c.cell==='J13').value,'=1/10');
 const view=f.run('cell','--sheet','طلبات 2027','--cell','H9');assert.equal(view.status,0,view.stderr);assert.match(view.json.jsonText,/Reference only/);assert.match(view.json.jsonText,/strike/);
 assert.notEqual(f.run('cells','--sheet','Arbitrary RR').status,0);
});
test('explicit local field comparisons preserve exact text, numeric and boolean semantics',async t=>{
 const f=await fixture(t);
 execFileSync('python3',['-c',`from openpyxl import load_workbook\nimport sys\nw=load_workbook(sys.argv[1]);s=w.active;s['F2']=12.5;s['F2'].number_format='$0.00';s['H2']=True;w.save(sys.argv[1])`,join(f.root,'original.xlsx')]);
 const job=JSON.parse(await readFile(join(f.root,'job.json')));job.sha256=createHash('sha256').update(await readFile(join(f.root,'original.xlsx'))).digest('hex');await writeFile(join(f.root,'job.json'),JSON.stringify(job));
 const row={...f.receipt.result[0],name:'Original',price:{amount:12.5},enabled:true};
 const compare=()=>f.run('compare-codes','--sheet','Arbitrary RR','--start-row','2','--end-row','2','--compare-fields',JSON.stringify({A:'name',F:'price.amount',H:'enabled'}));
 await writeFile(join(f.root,'receipts/api-one.json'),JSON.stringify({...f.receipt,result:[row]}));
 const equal=compare();assert.equal(equal.status,0,equal.stderr);assert.equal(equal.json.counts['existing-identity'],1);assert.deepEqual(equal.json.exceptions,[]);
 let full=JSON.parse(await readFile(join(f.root,equal.json.comparison)));assert.ok(full.rows[0].fieldChecks.every(c=>c.status==='equal-value'));assert.equal(full.rows[0].requirementsSatisfied,null);
 await writeFile(join(f.root,'receipts/api-one.json'),JSON.stringify({...f.receipt,startedAt:'2026-02-01',result:[{...row,name:'Original ',price:{amount:'12.5'},enabled:1}]}));
 const mismatch=compare();assert.equal(mismatch.status,0,mismatch.stderr);assert.equal(mismatch.json.counts['fields-need-review'],1);assert.equal(mismatch.json.exceptions[0].fieldIssues.length,3);
 full=JSON.parse(await readFile(join(f.root,mismatch.json.comparison)));const amount=full.rows[0].fieldChecks.find(c=>c.field==='price.amount');assert.equal(amount.required.value,12.5);assert.equal(amount.required.numberFormat,'$0.00');assert.equal(amount.saved,'12.5');
 assert.notEqual(mismatch.json.comparison,equal.json.comparison,'new receipt state is never cached as old comparison');
});
test('blank, formula and unavailable fields require review; invalid mappings never infer defaults',async t=>{
 const f=await fixture(t);
 execFileSync('python3',['-c',`from openpyxl import load_workbook\nimport sys\nw=load_workbook(sys.argv[1]);w.active['F2']='=1/10';w.save(sys.argv[1])`,join(f.root,'original.xlsx')]);
 const job=JSON.parse(await readFile(join(f.root,'job.json')));job.sha256=createHash('sha256').update(await readFile(join(f.root,'original.xlsx'))).digest('hex');await writeFile(join(f.root,'job.json'),JSON.stringify(job));
 const result=f.run('compare-codes','--sheet','Arbitrary RR','--start-row','2','--end-row','5','--compare-fields',JSON.stringify({A:'absent',G:'name',B:'code',F:'amount'}));assert.equal(result.status,0,result.stderr);
 assert.equal(result.json.counts['fields-need-review'],1);assert.equal(result.json.counts['formula-needs-review'],1);
 const full=JSON.parse(await readFile(join(f.root,result.json.comparison)));assert.equal(full.rows[0].fieldChecks[0].status,'unavailable');assert.equal(full.rows[0].fieldChecks[1].status,'unspecified');assert.equal(full.rows[0].fieldChecks[1].required,null);assert.equal(full.rows[0].fieldChecks[3].status,'formula-needs-review');
 for(const mapping of ['[]','{"A":3}','{"A":"items[0]"}','{"XFE":"name"}','{"a":"name"}','not-json'])assert.notEqual(f.run('compare-codes','--sheet','Arbitrary RR','--compare-fields',mapping).status,0);
 assert.ok(full.rows.every(r=>r.requirementsSatisfied===null));
});
test('large local comparisons print exceptions only while retaining every source and value',async t=>{
 const f=await fixture(t);
 execFileSync('python3',['-c',`from openpyxl import Workbook\nimport sys\nw=Workbook();s=w.active;s.title='Changed layout';s.append(['Notes','Price','Code','Required name'])\nfor i in range(400): s.append(['Reference',i,'CODE-'+str(i),'Name '+str(i)])\nw.save(sys.argv[1])`,join(f.root,'original.xlsx')]);
 const job=JSON.parse(await readFile(join(f.root,'job.json')));job.sha256=createHash('sha256').update(await readFile(join(f.root,'original.xlsx'))).digest('hex');await writeFile(join(f.root,'job.json'),JSON.stringify(job));
 const rows=Array.from({length:400},(_,i)=>({id:'id-'+i,code:'CODE-'+i,name:i===399?'Different':'Name '+i,amount:i}));
 await writeFile(join(f.root,'receipts/api-one.json'),JSON.stringify({...f.receipt,result:rows}));
 const r=f.run('compare-codes','--sheet','Changed layout','--column','C','--start-row','2','--compare-fields',JSON.stringify({B:'amount',D:'name'}));assert.equal(r.status,0,r.stderr);
 assert.equal(r.json.comparedRows,400);assert.equal(r.json.counts['existing-identity'],399);assert.equal(r.json.counts['fields-need-review'],1);assert.equal(r.json.exceptions[0].source,'Changed layout!C401');assert.ok(r.stdout.length<2500);
 const full=JSON.parse(await readFile(join(f.root,r.json.comparison)));assert.equal(full.rows.length,400);assert.equal(full.rows[0].fieldChecks[0].required.value,0);assert.equal(full.rows[399].fieldChecks[1].saved,'Different');
 assert.ok(full.rows.every(r=>r.requirementsSatisfied===null));
});

async function auditFixture(t){
 const f=await fixture(t),job=JSON.parse(await readFile(join(f.root,'job.json')));
 const ledger={schemaVersion:1,sourceSha256:job.sha256,eventId,sheets:[{sheet:'Arbitrary RR',disposition:'REVIEWED',reason:'Requirements extracted'},{sheet:'Hidden',disposition:'NOT_APPLICABLE',reason:'Empty worksheet'}],requirements:[{id:'r1',requirement:'Use the required existing name',sources:[{sheet:'Arbitrary RR',range:'A2:B2'}],disposition:'VERIFIED_EXISTING',objectIdentity:'discount-1',verification:'Name and code read from saved catalog',evidence:['receipts/api-one.json']}]};
 const audit=async()=>{await writeFile(join(f.root,'requirements.json'),JSON.stringify(ledger));const r=f.run('audit');assert.equal(r.status,0,r.stderr);return r.json;};
 return {...f,ledger,audit};
}
test('audit binds source/target, accounts for hidden sheets, preserves evidence and never declares acceptance',async t=>{
 const f=await auditFixture(t),r=await f.audit();assert.equal(r.status,'STRUCTURALLY_ACCOUNTED');assert.equal(r.issueCount,0);assert.match(r.notice,/not proof/);
 const before=await readFile(join(f.root,'requirements.json'));assert.equal((await f.audit()).evidence,r.evidence);assert.deepEqual(await readFile(join(f.root,'requirements.json')),before);assert.deepEqual(await readFile(join(f.root,'original.xlsx')),f.original);
 f.ledger.sheets.pop();assert.ok((await f.audit()).issues.some(x=>x.code==='SHEET_UNACCOUNTED'));
 f.ledger.sourceSha256='wrong';f.ledger.eventId='foreign';const bad=await f.audit();assert.equal(bad.status,'INCOMPLETE');assert.ok(bad.issues.some(x=>x.code==='WORKBOOK_BINDING_MISMATCH'));assert.ok(bad.issues.some(x=>x.code==='EVENT_BINDING_MISMATCH'));
});
test('audit identifies missing ledger, invalid source, duplicate IDs and unsupported verification',async t=>{
 const f=await auditFixture(t);assert.equal(f.run('audit').json.status,'INCOMPLETE');
 const row=f.ledger.requirements[0];row.sources[0].range='A99999';row.evidence=['evidence/comparison-identity-only.json'];f.ledger.requirements.push({...row});
 const r=await f.audit();for(const code of ['SOURCE_INVALID_OR_OUT_OF_BOUNDS','INVALID_OR_DUPLICATE_ID','SAVED_STATE_EVIDENCE_MISSING'])assert.ok(r.issues.some(x=>x.code===code),code);
 row.sources[0].range='A1';row.evidence=['receipts/../job.json'];assert.ok((await f.audit()).issues.some(x=>x.code==='SAVED_STATE_EVIDENCE_MISSING'));
});
test('audit requires exact blocker fields, treats exceptions honestly and never passes untested or uncertain work',async t=>{
 const f=await auditFixture(t),row=f.ledger.requirements[0];row.disposition='BLOCKED';assert.ok((await f.audit()).issues.some(x=>x.code==='SPECIFIC_BLOCKER_OR_NEEDED_INPUT_MISSING'));
 row.reason='RR omits capacity.total';row.needed='Explicit approved capacity.total';assert.equal((await f.audit()).status,'STRUCTURALLY_ACCOUNTED_WITH_EXCEPTIONS');
 for(const status of ['UNTESTED','UNCERTAIN']){row.disposition=status;const r=await f.audit();assert.equal(r.status,'INCOMPLETE');assert.equal(r.counts[status],1);}
 row.disposition='PRESERVED_DIFFERENCE';assert.equal((await f.audit()).status,'STRUCTURALLY_ACCOUNTED_WITH_EXCEPTIONS');
 row.disposition='VERIFIED_CREATED';assert.ok((await f.audit()).issues.some(x=>x.code==='CREATION_ABSENCE_OR_INTENT_MISSING'));
 row.absenceEvidence=['receipts/api-one.json'];row.intentEvidence=['receipts/api-one.json'];assert.equal((await f.audit()).status,'STRUCTURALLY_ACCOUNTED');
 await writeFile(join(f.root,'api-write-uncertain.json'),'{}');assert.equal((await f.audit()).status,'INCOMPLETE');
});
test('audit rejects missing/symlinked receipts and ledgers, and paginates large gap lists',async t=>{
 const f=await auditFixture(t),row=f.ledger.requirements[0];await symlink(join(f.root,'job.json'),join(f.root,'receipts/link.json'));row.evidence=['receipts/link.json'];assert.ok((await f.audit()).issues.some(x=>x.code==='SAVED_STATE_EVIDENCE_MISSING'));
 row.evidence=['receipts/missing.json'];assert.ok((await f.audit()).issues.some(x=>x.code==='SAVED_STATE_EVIDENCE_MISSING'));
 f.ledger.requirements=Array.from({length:40},()=>({}));const r=await f.audit();assert.equal(r.issues.length,12);assert.equal(r.nextOffset,12);assert.ok(r.issueCount>40);assert.ok(JSON.stringify(r).length<12000);
 const full=JSON.parse(await readFile(join(f.root,r.evidence)));assert.equal(full.issues.length,r.issueCount);
 await rm(join(f.root,'requirements.json'));await symlink(join(f.root,'job.json'),join(f.root,'requirements.json'));assert.equal(f.run('audit').json.status,'INCOMPLETE');
});
