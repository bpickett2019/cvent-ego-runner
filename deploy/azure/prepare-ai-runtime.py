#!/usr/bin/env python3
"""Stage credentials/model once over SSH stdin; never enable, restart or prompt."""
import datetime
import json
import os
from pathlib import Path
import pwd
import socket
import subprocess
import sys
import urllib.request

ROOT=Path('/home/egorunner/cvent-ego-runner')
STATE=Path('/var/lib/cvent-ego-ai-preparation')
KEYS={'ANTHROPIC_API_KEY','CVENT_CLIENT_ID','CVENT_CLIENT_SECRET','CVENT_API_BASE_URL'}

def prepare(payload):
    assert os.geteuid()==0 and socket.gethostname() in {'cvent-ego-1','cvent-ego-2','cvent-ego-3'}
    os.umask(0o077)
    credentials=payload['credentials']; model=payload['model']
    assert set(credentials)==KEYS
    assert all(isinstance(v,str) and v and v.isascii() and not any(ord(c)<32 for c in v) for v in credentials.values())
    assert model['id']=='claude-sonnet-5' and model['api']=='anthropic-messages'
    assert model['contextWindow']==1000000 and model['maxTokens']==128000
    assert model['compat']['forceAdaptiveThinking'] is True
    assert all(isinstance(model['cost'][k],(int,float)) and model['cost'][k]>0 for k in ['input','output','cacheRead','cacheWrite'])
    env_path=Path('/etc/cvent-ego/runner.env')
    old=env_path.read_text();assert 'CVENT_EXECUTION_ENABLED=false' in old
    assert not any(k+'=' in old for k in KEYS), 'Credentials already configured; inspect, do not replay'
    with urllib.request.urlopen('http://127.0.0.1:8788/api/runtime',timeout=10) as r: before=json.load(r)
    assert before['executionEnabled'] is False and before['ownership']=='USER' and before['budget']['spentUSD']==0
    pid=subprocess.check_output(['systemctl','show','cvent-ego','--property=MainPID','--value'],text=True).strip()
    env=dict(v.split('=',1) for v in Path('/proc/'+pid+'/environ').read_bytes().decode().split('\0') if '=' in v)
    jobs=[json.loads(p.read_text()) for p in (ROOT/'data/jobs').glob('*/job.json')]
    assert all(not j.get('sessionId') and not j.get('ownedPid') and j['piCostUSD']==0 for j in jobs), 'Native activity requires separate reconciliation'
    account=pwd.getpwnam('egorunner'); config=Path('/home/egorunner/.pi/agent/models.json')
    assert not config.exists(), 'Existing model configuration must not be replaced'
    STATE.mkdir(mode=0o700)
    (STATE/'intent.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'STARTED_DO_NOT_REPLAY','model':'claude-sonnet-5','executionEnabled':False}))
    (STATE/'runner.env.before').write_text(old)
    for directory in [config.parent.parent,config.parent]:
        directory.mkdir(mode=0o700,exist_ok=True)
        assert not directory.is_symlink()
        os.chown(directory,account.pw_uid,account.pw_gid);directory.chmod(0o700)
    fields=['id','name','api','reasoning','input','cost','contextWindow','maxTokens','thinkingLevelMap','compat']
    definition={k:model[k] for k in fields if k in model}
    config.write_text(json.dumps({'providers':{'anthropic':{'baseUrl':'https://api.anthropic.com','api':'anthropic-messages','models':[definition]}}},indent=2))
    os.chown(config,account.pw_uid,account.pw_gid);config.chmod(0o600)
    values={'CVENT_EXECUTION_ENABLED':'false','PI_PROVIDER':'anthropic','PI_MODEL':'claude-sonnet-5',**credentials}
    temporary=env_path.with_name('runner.env.ai-preparation')
    with temporary.open('x') as f:
        f.write(''.join(k+'='+json.dumps(v)+'\n' for k,v in values.items()));f.flush();os.fsync(f.fileno())
    os.replace(temporary,env_path)
    env.update(values)
    # Drop privileges before prerequisite checks; never pass keys in argv.
    def user():
        os.initgroups(account.pw_name,account.pw_gid);os.setgid(account.pw_gid);os.setuid(account.pw_uid)
    listed=subprocess.run(['/usr/local/bin/pi','--offline','--list-models','claude-sonnet-5'],cwd=ROOT,env=env,capture_output=True,text=True,preexec_fn=user,timeout=45)
    assert listed.returncode==0 and 'claude-sonnet-5' in listed.stdout and 'anthropic' in listed.stdout, 'Configured model did not load; raw output suppressed'
    checked=subprocess.run(['/usr/local/bin/node','scripts/check-installation.mjs'],cwd=ROOT,env=env,capture_output=True,text=True,preexec_fn=user,timeout=30)
    assert checked.returncode==0, 'Prerequisite check failed; output suppressed'
    checks=json.loads(checked.stdout);assert checks['status']=='OFFLINE_CHECKS_PASS'
    request=urllib.request.Request('https://api.anthropic.com/v1/models/claude-sonnet-5',headers={'x-api-key':credentials['ANTHROPIC_API_KEY'],'anthropic-version':'2023-06-01'})
    with urllib.request.urlopen(request,timeout=30) as r: assert json.load(r)['id']=='claude-sonnet-5'
    program="import { CventConnection } from './app/cvent-api.mjs'; try { const result=await new CventConnection().authenticate(); if(!result.token) throw new Error(); console.log('CVENT_OAUTH_VERIFIED'); } catch { console.log('CVENT_OAUTH_NOT_VERIFIED'); process.exitCode=1; }"
    authenticated=subprocess.run(['/usr/local/bin/node','--input-type=module','-e',program],cwd=ROOT,env=env,capture_output=True,text=True,preexec_fn=user,timeout=90)
    cvent_verified=authenticated.returncode==0 and authenticated.stdout.strip()=='CVENT_OAUTH_VERIFIED'
    assert subprocess.check_output(['systemctl','show','cvent-ego','--property=MainPID','--value'],text=True).strip()==pid
    with urllib.request.urlopen('http://127.0.0.1:8788/api/runtime',timeout=10) as r: after=json.load(r)
    assert before==after, 'Running workspace changed during credential staging'
    receipt={'status':'CREDENTIALS_AND_MODEL_STAGED_AI_DISABLED_NO_RESTART','host':socket.gethostname(),'provider':'anthropic','model':'claude-sonnet-5','modelRegisteredInPinnedPi':True,'adaptiveThinkingConfigured':True,'prerequisiteChecksPassed':len(checks['checks']),'anthropicAuthenticationVerified':True,'cventOAuthVerified':cvent_verified,'credentialFileMode':oct(env_path.stat().st_mode & 0o777),'runningWorkspaceUnchanged':True,'paidInferenceRequests':0,'activationBlockers':['Approved disjoint event assignments including local/other executors','Shared execution and API quota safeguards']}
    (STATE/'receipt.json').write_text(json.dumps(receipt,indent=2));return receipt

if __name__=='__main__':
    try: print(json.dumps(prepare(json.load(sys.stdin)),indent=2))
    except Exception as error:
        # Exceptions can carry private request/environment values; expose type only.
        print(json.dumps({'status':'PREPARATION_NOT_CONFIRMED_INSPECT_STATE_NO_REPLAY','errorType':type(error).__name__}),file=sys.stderr)
        sys.exit(1)
