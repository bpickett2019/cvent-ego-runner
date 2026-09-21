import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('refresh', Path(__file__).with_name('refresh-stage.py'))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class SourceRefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base/'runner'; self.root.mkdir()
        self.state = self.base/'receipts'
        self.entries = {name: ('unchanged '+name).encode() for name in set(refresh.FILES) | refresh.FIXED}
        self.entries.update({'app/native-task.md': b'Choose your own plan', 'app/standing-sow.md': b'Standing scope', 'app/run-policy.mjs': b'new native Pi policy'})
        self.old = {k: v for k, v in self.entries.items() if k not in {'bin/rr-evidence', 'app/native-task.md', 'app/standing-sow.md'}}
        self.old['app/run-policy.mjs'] = b'old policy'
        for name, body in self.old.items():
            p = self.root/name; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(body)
        (self.root/'source-manifest.json').write_text(json.dumps(self.manifest(self.old)))
        (self.root/'data/current').mkdir(parents=True)
        (self.root/'data/current/runtime.json').write_text('{"ownership":"USER"}')
        self.archive = self.base/'source.tar.gz'
        self.make_archive()

    def manifest(self, entries):
        return {'egoRevision': refresh.PIN, 'files': {n: refresh.digest(b) for n, b in entries.items()}}

    def make_archive(self, entries=None, manifest=None, extra=None):
        entries = dict(self.entries if entries is None else entries)
        entries['source-manifest.json'] = json.dumps(manifest or self.manifest(entries)).encode()
        with tarfile.open(self.archive, 'w:gz') as archive:
            for name, body in entries.items():
                info = tarfile.TarInfo(name); info.size = len(body)
                archive.addfile(info, io.BytesIO(body))
            if extra is not None: archive.addfile(extra)
        self.sha = refresh.digest(self.archive.read_bytes())

    def contexts(self, verifier=lambda: {'appInactiveAndDisabled': True}):
        from contextlib import ExitStack
        stack = ExitStack()
        uid, gid = os.getuid(), os.getgid()
        for target, value in [('ROOT', self.root), ('STATE', self.state), ('verify_stage', verifier)]:
            stack.enter_context(patch.object(refresh, target, value))
        stack.enter_context(patch.object(refresh.os, 'geteuid', return_value=0))
        stack.enter_context(patch.object(refresh.socket, 'gethostname', return_value='cvent-ego-1'))
        stack.enter_context(patch.object(refresh.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=uid, pw_gid=gid)))
        return stack

    def test_refresh_changes_only_manifested_source_preserves_data_and_backup(self):
        before = refresh.data_snapshot(self.root)
        checks = []
        def verify():
            manifest = json.loads((self.root/'source-manifest.json').read_text())
            self.assertTrue(all(refresh.digest((self.root/n).read_bytes()) == h for n, h in manifest['files'].items()))
            checks.append(True)
            return {'appInactiveAndDisabled': True}
        with self.contexts(verify):
            receipt = refresh.refresh(self.archive, self.sha)
        self.assertEqual(receipt['status'], 'SOURCE_REFRESHED_VERIFIED_APP_DISABLED')
        self.assertEqual(len(checks), 3)
        self.assertEqual(refresh.data_snapshot(self.root), before)
        self.assertEqual((self.root/'app/run-policy.mjs').read_bytes(), self.entries['app/run-policy.mjs'])
        self.assertEqual((self.state/self.sha/'previous-source/app/run-policy.mjs').read_bytes(), b'old policy')
        self.assertEqual((self.root/'bin/rr-evidence').stat().st_mode & 0o777, 0o755)
        self.assertEqual((self.root/'app/native-task.md').stat().st_mode & 0o777, 0o600)
        self.assertFalse(receipt['appStarted']); self.assertFalse(receipt['credentialsCopied'])

    def test_hash_duplicate_link_and_runtime_archive_members_rejected(self):
        with self.assertRaises(ValueError): refresh.read_archive(self.archive, '0'*64)
        for name in ['data/current/runtime.json', '.pi/agent/auth.json', '../outside.md', '/app/absolute.md', 'app/__pycache__/bad.py', 'app/../outside.md']:
            self.make_archive({**self.entries, name: b'not source'})
            with self.subTest(name=name), self.assertRaises(ValueError): refresh.read_archive(self.archive, self.sha)
        for name, typ in [('package.json', tarfile.REGTYPE), ('app/link.md', tarfile.SYMTYPE)]:
            info = tarfile.TarInfo(name); info.type = typ; info.linkname = '/etc/passwd'
            self.make_archive(extra=info)
            with self.assertRaises(ValueError): refresh.read_archive(self.archive, self.sha)

    def test_manifest_hash_and_missing_required_helper_rejected(self):
        self.make_archive(manifest={**self.manifest(self.entries), 'files': {**self.manifest(self.entries)['files'], 'app/native-task.md': '0'*64}})
        with self.assertRaises(ValueError): refresh.read_archive(self.archive, self.sha)
        self.make_archive({k:v for k,v in self.entries.items() if k != 'bin/rr-evidence'})
        with self.assertRaises(ValueError): refresh.read_archive(self.archive, self.sha)

    def test_removal_dependency_change_drift_and_unmanifested_collision_rejected(self):
        entries, manifest = refresh.read_archive(self.archive, self.sha)
        for name in refresh.FIXED:
            altered = {**entries, name: b'dependency changed'}
            with self.subTest(name=name), self.assertRaises(ValueError): refresh.plan_refresh(self.root, altered, self.manifest(altered))
        removed = {k:v for k,v in entries.items() if k != 'app/run-policy.mjs'}
        with self.assertRaises(ValueError): refresh.plan_refresh(self.root, removed, self.manifest(removed))
        (self.root/'app/native-task.md').write_text('unmanifested user file')
        with self.assertRaises(ValueError): refresh.plan_refresh(self.root, entries, manifest)
        (self.root/'app/native-task.md').unlink()
        (self.root/'app/run-policy.mjs').write_text('unexpected edit')
        with self.assertRaises(ValueError): refresh.plan_refresh(self.root, entries, manifest)

    def test_existing_source_symlink_cannot_redirect_refresh(self):
        entries, manifest = refresh.read_archive(self.archive, self.sha)
        target = self.root/'app/run-policy.mjs'; body = target.read_bytes(); target.unlink()
        outside = self.base/'outside'; outside.write_bytes(body); target.symlink_to(outside)
        with self.assertRaises(ValueError): refresh.plan_refresh(self.root, entries, manifest)
        self.assertEqual(outside.read_bytes(), body)

    def test_active_or_configured_stage_failure_prevents_intent_and_writes(self):
        def deny(): raise ValueError('App active or credentials present')
        with self.contexts(deny), self.assertRaises(ValueError): refresh.refresh(self.archive, self.sha)
        self.assertFalse(self.state.exists())
        self.assertEqual((self.root/'app/run-policy.mjs').read_bytes(), b'old policy')

    def test_second_preflight_failure_retains_intent_and_never_replays(self):
        calls = []
        def verify():
            calls.append(True)
            if len(calls) == 2: raise ValueError('Activation changed')
        with self.contexts(verify), self.assertRaises(ValueError): refresh.refresh(self.archive, self.sha)
        self.assertTrue((self.state/self.sha/'intent.json').exists())
        self.assertFalse((self.state/self.sha/'receipt.json').exists())
        self.assertEqual((self.root/'app/run-policy.mjs').read_bytes(), b'old policy')
        with self.contexts(), self.assertRaises(FileExistsError): refresh.refresh(self.archive, self.sha)

    def test_successful_refresh_cannot_be_replayed(self):
        with self.contexts():
            refresh.refresh(self.archive, self.sha)
            with self.assertRaises(FileExistsError): refresh.refresh(self.archive, self.sha)

    def test_tool_contains_no_service_start_stop_or_credential_install(self):
        text = Path(__file__).with_name('refresh-stage.py').read_text()
        for command in ['systemctl start', 'systemctl enable', 'systemctl restart', 'docker run', 'pi --', 'runner.env', 'auth.json']:
            self.assertNotIn(command, text)


if __name__ == '__main__':
    unittest.main()
