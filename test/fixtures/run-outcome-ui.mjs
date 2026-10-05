// Disposable real-UI fixture. No Pi, Steel, Cvent, credentials or customer files.
import '../offline-network.mjs';
import express from 'express';
import { resolve } from 'node:path';
const app=express();app.use(express.json());app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const id='11111111-1111-4111-8111-111111111111',contextId='22222222-2222-4222-8222-222222222222';let mode='incomplete';
const modes=new Set(['incomplete','done','stopped','unitemized']);
const job=()=>({id,originalName:'Synthetic_MVP_Demo.xlsx',requestedEventName:'Synthetic outcome fixture',browser:{runtimeId:'fixture-runtime',steelSessionId:'fixture-session',activeTargetId:'fixture-page'},target:{apiEventId:'fixture-event'},apiPreflight:{eventId:'fixture-event'},status:mode==='done'?'DONE':mode==='stopped'?'STOPPED':'INCOMPLETE',phase:'SETTLED',workflow:'login-first',createdAt:'2026-01-01T10:00:00Z',aiStartedAt:'2026-01-01T10:01:00Z',finishedAt:'2026-01-01T10:02:00Z',piCostUSD:0,totalEventCostUSD:0,stopReason:mode==='stopped'?'Operator Stop':null,lastAssistantText:'Synthetic fixture only. No Cvent configuration, browser or paid build was started.'});
app.get('/api/runtime',(_req,res)=>res.json({ownership:'USER',loginFirst:true,executionEnabled:false,browserStopped:true,operatorPauseSupported:true,rrContext:{id:contextId,jobId:id,workbookId:null},budget:{spentUSD:0,spendingLimitEnabled:false}}));
app.get('/api/jobs',(_req,res)=>res.json([job()]));
app.get('/api/jobs/:id',(_req,res)=>res.json(job()));
app.get('/api/jobs/:id/results/state.json',(_req,res)=>res.json(mode==='unitemized'?{}:{requirements:[
 {id:'contact',label:'Contact email',status:'verified_changed',verification:'Synthetic saved readback'},
 {id:'banner',label:'Banner image',status:mode==='done'?'verified_existing':'blocked',reason:'Missing banner file — Website!B4',verification:'Synthetic saved readback'},
 {id:'price',label:'Admission fee',status:mode==='done'?'verified_existing':'unverified',reason:'Missing price — Pricing!C9',verification:'Synthetic saved readback'},
]}));
app.get('/api/execution-status',(_req,res)=>res.json({version:1,scope:'shared',checkedAt:new Date().toISOString(),capacity:'AVAILABLE',holder:null,eventSafety:'CLEAR',holdCount:0,owners:[]}));
app.get('/local-workspaces.json',(_req,res)=>res.sendStatus(404));
app.get('/viewer',(_req,res)=>res.type('html').send('<h2>Outcome fixture only</h2><p>No browser or agent connected.</p>'));
app.post('/fixture-case',(req,res)=>{if(!modes.has(req.body?.mode))return res.sendStatus(400);mode=req.body.mode;res.json({fixtureOnly:true,mode});});
app.use(express.static(resolve(new URL('../../public',import.meta.url).pathname)));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
console.log(JSON.stringify({origin:`http://127.0.0.1:${server.address().port}`,pid:process.pid,fixtureOnly:true}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>process.exit(0));server.closeAllConnections();});
