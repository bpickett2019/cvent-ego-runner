#!/usr/bin/env python3
"""Source-only deployment snapshot. No jobs, profiles, credentials or accounting."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

PIN = 'dca7003349c5f7132189ba00547cbbd7ff8e597e'
DIRECTORIES = {'app': {'.mjs', '.py', '.md'}, 'public': {'.js', '.html', '.css'},
               'ego-bridge': {'.mjs', '.patch'}, '.pi/skills/ego-browser': {'.md'}}
FILES = ('package.json', 'package-lock.json', 'requirements.txt', 'bin/ego-browser', 'bin/cvent-api', 'bin/rr-evidence',
         'CVENT-API.md', 'CVENT-API-COVERAGE.md', 'RR-EVIDENCE.md', 'RPC-CONNECTION.md',
         'scripts/check-installation.mjs')


def source_files(root):
    paths = [root / name for name in FILES]
    for directory, suffixes in DIRECTORIES.items():
        base = root / directory
        for path in base.rglob('*'):
            if path.is_symlink():
                raise ValueError('Source symlinks are not allowed in deployment artifacts')
            if path.is_file() and path.suffix in suffixes and '__pycache__' not in path.parts:
                paths.append(path)
    for path in paths:
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError('Missing or nonlocal required source file')
    return sorted(set(paths))


def bundle(root, clients_root, configuration_root, output):
    run = lambda *args: subprocess.check_output(args, cwd=root)
    vendor = root / 'vendor/ego-lite'
    if run('git', '-C', str(vendor), 'rev-parse', 'HEAD').decode().strip() != PIN:
        raise ValueError('Unexpected upstream Ego revision')
    actual = run('git', '-C', str(vendor), 'diff', 'HEAD', '--', 'package/ego-browser/src/page-ledger.ts')
    if actual != (root / 'ego-bridge/patches/steel-session-ledger.patch').read_bytes():
        raise ValueError('Vendor patch differs from reviewed patch file')
    changed = run('git', '-C', str(vendor), 'diff', '--name-only', 'HEAD').decode().splitlines()
    if changed != ['package/ego-browser/src/page-ledger.ts']:
        raise ValueError('Unexpected tracked vendor changes')
    entries = {str(p.relative_to(root)): p.read_bytes() for p in source_files(root)}
    for base, relative, destination in (
        (clients_root, 'src/cvent/api.ts', 'external/cvent-agent/src/cvent/api.ts'),
        (clients_root, 'src/cvent/controlPolicy.ts', 'external/cvent-agent/src/cvent/controlPolicy.ts'),
        (configuration_root, 'src/cvent-api.ts', 'external/cvent-ui-automation/src/cvent-api.ts'),
        (configuration_root, 'src/errors.ts', 'external/cvent-ui-automation/src/errors.ts')):
        path = base / relative
        if path.is_symlink() or not path.resolve().is_relative_to(base.resolve()):
            raise ValueError('External source is not a local regular file')
        entries[destination] = path.read_bytes()
    # Export committed upstream source, not its working tree/build/cache/.git.
    upstream = run('git', '-C', str(vendor), 'archive', '--format=tar', PIN)
    entries['ego-upstream.tar'] = upstream
    manifest = {'egoRevision': PIN, 'files': {name: hashlib.sha256(body).hexdigest() for name, body in entries.items()},
                'excludes': ['credentials', 'jobs', 'profiles', 'workbooks', 'accounting', 'Pi sessions', 'global Pi configuration'],
                'status': 'SOURCE_SNAPSHOT_NOT_DEPLOYMENT_ACCEPTANCE'}
    entries['source-manifest.json'] = (json.dumps(manifest, indent=2)+'\n').encode()
    with output.open('xb') as stream, tarfile.open(fileobj=stream, mode='w:gz') as archive:
        for name, body in sorted(entries.items()):
            info = tarfile.TarInfo(name)
            info.size = len(body)
            info.mode = 0o755 if name.startswith('bin/') else 0o600
            archive.addfile(info, io.BytesIO(body))
    return {'sourceFiles': len(entries), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'credentialsCopied': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--clients-root', type=Path, required=True)
    parser.add_argument('--configuration-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(bundle(args.root.resolve(), args.clients_root.resolve(), args.configuration_root.resolve(), args.output)))
