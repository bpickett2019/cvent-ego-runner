#!/usr/bin/env python3
"""Refresh reviewed source on an UNUSED, disabled staged VM; never activate/replay."""
import argparse
import datetime
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import socket
import tarfile
import tempfile

from bundle import DIRECTORIES, FILES, PIN

ROOT = Path('/home/egorunner/cvent-ego-runner')
STATE = Path('/var/lib/cvent-ego-source-refresh')
EXTERNAL = {'external/cvent-agent/src/cvent/api.ts', 'external/cvent-agent/src/cvent/controlPolicy.ts',
            'external/cvent-ui-automation/src/cvent-api.ts', 'external/cvent-ui-automation/src/errors.ts'}
FIXED = EXTERNAL | {'package.json', 'package-lock.json', 'requirements.txt', 'ego-upstream.tar',
                    'ego-bridge/patches/steel-session-ledger.patch'}
MAX_FILE = 100_000_000
MAX_TOTAL = 256_000_000


def digest(body):
    return hashlib.sha256(body).hexdigest()


def allowed_source(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or str(p) != name or '__pycache__' in p.parts:
        return False
    if name in set(FILES) | EXTERNAL | {'ego-upstream.tar'}:
        return True
    return any(name.startswith(base+'/') and p.suffix in suffixes for base, suffixes in DIRECTORIES.items())


def read_archive(path, expected):
    if not re.fullmatch(r'[a-f0-9]{64}', expected):
        raise ValueError('Expected approved archive SHA256')
    if path.is_symlink() or path.stat().st_size > MAX_TOTAL:
        raise ValueError('Unsafe archive file')
    body = path.read_bytes()
    if digest(body) != expected:
        raise ValueError('Archive hash mismatch')
    with tarfile.open(fileobj=io.BytesIO(body), mode='r:gz') as archive:
        members = archive.getmembers()
        names = [m.name for m in members]
        if len(names) != len(set(names)) or len(names) > 5000:
            raise ValueError('Duplicate or excessive archive paths')
        if sum(m.size for m in members) > MAX_TOTAL:
            raise ValueError('Oversized archive')
        for m in members:
            if not m.isfile() or not 0 <= m.size <= MAX_FILE or not (m.name == 'source-manifest.json' or allowed_source(m.name)):
                raise ValueError('Unsafe archive member')
        entries = {m.name: archive.extractfile(m).read() for m in members}
    manifest = json.loads(entries.pop('source-manifest.json'))
    if manifest.get('egoRevision') != PIN or set(entries) != set(manifest['files']):
        raise ValueError('Manifest identity/content mismatch')
    if not (set(FILES) | FIXED) <= set(entries):
        raise ValueError('Missing required source')
    for name, body in entries.items():
        if digest(body) != manifest['files'][name]:
            raise ValueError('Source hash mismatch')
    return entries, manifest


def regular_path(root, name, missing=False):
    p = root/name
    if root.is_symlink() or any(parent.is_symlink() for parent in [p, *p.parents]):
        raise ValueError('Symlink in source path')
    if not p.exists() and missing:
        return p
    if not p.is_file():
        raise ValueError('Source is not a regular file')
    return p


def plan_refresh(root, entries, manifest):
    old_bytes = regular_path(root, 'source-manifest.json').read_bytes()
    old = json.loads(old_bytes)
    if old.get('egoRevision') != PIN or not set(old['files']) <= set(entries):
        raise ValueError('Source removal or vendor change is not a refresh')
    for name, sha in old['files'].items():
        if not allowed_source(name) or digest(regular_path(root, name).read_bytes()) != sha:
            raise ValueError('Existing staged source drift')
    for name in FIXED:
        if old['files'].get(name) != manifest['files'].get(name):
            raise ValueError('Dependency change requires a separate installation plan')
    changed = []
    for name, body in entries.items():
        p = regular_path(root, name, missing=True)
        if name not in old['files'] and p.exists():
            raise ValueError('Unmanifested file collision')
        if old['files'].get(name) != digest(body):
            changed.append(name)
    return old_bytes, sorted(changed)


def data_snapshot(root):
    result = {}
    for p in (root/'data').rglob('*'):
        if p.is_symlink():
            raise ValueError('Unexpected staged data symlink')
        if p.is_file():
            result[str(p.relative_to(root))] = digest(p.read_bytes())
    return result


def write_owned(root, name, body, uid, gid):
    p = regular_path(root, name, missing=True)
    missing = []
    parent = p.parent
    while not parent.exists():
        missing.append(parent); parent = parent.parent
    for directory in reversed(missing):
        directory.mkdir(mode=0o700); os.chown(directory, uid, gid)
    fd, temp = tempfile.mkstemp(prefix='.source-refresh-', dir=p.parent)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(body); stream.flush(); os.fsync(stream.fileno())
        os.fchmod(stream.fileno(), 0o755 if name.startswith('bin/') else 0o600)
        os.fchown(stream.fileno(), uid, gid)
    os.replace(temp, p)


def verify_stage():
    spec = importlib.util.spec_from_file_location('stage_verifier', Path(__file__).with_name('verify-stage.py'))
    verifier = importlib.util.module_from_spec(spec); spec.loader.exec_module(verifier)
    return verifier.verify()


def refresh(archive, sha):
    if os.geteuid() != 0 or socket.gethostname() not in {'cvent-ego-1', 'cvent-ego-2', 'cvent-ego-3'}:
        raise ValueError('Unexpected deployment host/user')
    os.umask(0o077)
    verify_stage()  # No credentials, jobs, containers, activation, running service or drift.
    entries, manifest = read_archive(archive, sha)
    old_bytes, changed = plan_refresh(ROOT, entries, manifest)
    before = data_snapshot(ROOT)
    account = pwd.getpwnam('egorunner')
    base = STATE
    base.mkdir(mode=0o700, exist_ok=True)
    receipt_dir = base/sha
    receipt_dir.mkdir(mode=0o700)  # Exclusive durable intent; no replay, even after failure.
    intent = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'host': socket.gethostname(),
              'archiveSha256': sha, 'previousManifestSha256': digest(old_bytes), 'changedPaths': changed,
              'status': 'STARTED_DO_NOT_REPLAY', 'appStarted': False, 'credentialsCopied': False,
              'paidPrompts': 0, 'browserLaunches': 0}
    (receipt_dir/'intent.json').write_text(json.dumps(intent, indent=2)+'\n')
    backup = receipt_dir/'previous-source'; backup.mkdir(mode=0o700)
    (backup/'source-manifest.json').write_bytes(old_bytes)
    for name in changed:
        source = ROOT/name
        if source.exists():
            target = backup/name; target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            target.write_bytes(source.read_bytes())
    verify_stage()  # Recheck immediately before mutation; fail closed if activation occurred.
    assert plan_refresh(ROOT, entries, manifest) == (old_bytes, changed)
    for name in changed:
        write_owned(ROOT, name, entries[name], account.pw_uid, account.pw_gid)
    write_owned(ROOT, 'source-manifest.json', (json.dumps(manifest, indent=2)+'\n').encode(), account.pw_uid, account.pw_gid)
    result = verify_stage()
    if data_snapshot(ROOT) != before:
        raise ValueError('Staged runtime data changed')
    receipt = {**intent, 'status': 'SOURCE_REFRESHED_VERIFIED_APP_DISABLED',
               'verification': result, 'protectedDataFiles': len(before), 'dataUnchanged': True,
               'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    with (receipt_dir/'receipt.json').open('x') as f:
        json.dump(receipt, f, indent=2)
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--sha256', required=True)
    args = parser.parse_args()
    print(json.dumps(refresh(args.archive, args.sha256), indent=2))
