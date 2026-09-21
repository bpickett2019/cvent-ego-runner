import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent

def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name+'.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

plan = load('plan')
bundle = load('bundle')
verify = load('verify-stage')
KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakePublicKeyFixtureOnly'


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.resources = plan.template(KEY, '8.8.8.8/32')['resources']

    def resources_of(self, suffix):
        return [r for r in self.resources if r['type'].endswith('/'+suffix)]

    def test_three_separate_arm_virtual_machines(self):
        vms = self.resources_of('virtualMachines')
        self.assertEqual(len(vms), 3)
        self.assertEqual(len({r['name'] for r in vms}), 3)
        for vm in vms:
            self.assertEqual(vm['properties']['hardwareProfile']['vmSize'], 'Standard_D4ps_v6')
            self.assertEqual(vm['properties']['storageProfile']['imageReference']['sku'], 'server-arm64')
            self.assertTrue(vm['properties']['osProfile']['linuxConfiguration']['disablePasswordAuthentication'])

    def test_each_vm_has_a_dedicated_interface_and_address(self):
        self.assertEqual(len(self.resources_of('networkInterfaces')), 3)
        self.assertEqual(len(self.resources_of('publicIPAddresses')), 3)
        interfaces = [r['properties']['networkProfile']['networkInterfaces'][0]['id'] for r in self.resources_of('virtualMachines')]
        self.assertEqual(len(set(interfaces)), 3)

    def test_only_admin_ssh_and_no_peer_inbound(self):
        rules = self.resources_of('networkSecurityGroups')[0]['properties']['securityRules']
        self.assertEqual(len(rules), 2)
        allow, deny = [r['properties'] for r in rules]
        self.assertEqual((allow['access'], allow['sourceAddressPrefix'], allow['destinationPortRange']), ('Allow', '8.8.8.8/32', '22'))
        self.assertEqual((deny['access'], deny['sourceAddressPrefix'], deny['destinationPortRange']), ('Deny', '*', '*'))
        self.assertLess(allow['priority'], deny['priority'])

    def test_rejects_open_private_and_ambiguous_cidrs(self):
        for cidr in ('0.0.0.0/0', '8.8.8.0/24', '8.8.8.8/24', '127.0.0.1/32', '10.0.0.1/32', '::/0'):
            with self.subTest(cidr=cidr), self.assertRaises(ValueError):
                plan.template(KEY, cidr)

    def test_rejects_private_key_and_multiline_input(self):
        for key in ('-----BEGIN OPENSSH PRIVATE KEY-----', KEY+'\nssh-ed25519 other'):
            with self.assertRaises(ValueError):
                plan.template(key, '8.8.8.8/32')

    def test_no_credentials_bootstrap_or_automatic_execution(self):
        encoded = json.dumps(self.resources)
        for field in ('customData', 'adminPassword', 'CVENT_CLIENT_SECRET', 'auth.json'):
            self.assertNotIn(field, encoded)
        for vm in self.resources_of('virtualMachines'):
            self.assertEqual(vm['properties']['storageProfile']['osDisk']['deleteOption'], 'Detach')

    def test_snapshot_excludes_runtime_and_global_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in bundle.FILES:
                path = root/name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('fixture')
            for name in ('data/jobs/private.json', '.pi/auth.json', '.env', 'app/__pycache__/bad.py', 'app/private.env'):
                path = root/name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('private fixture')
            selected = {str(p.relative_to(root)) for p in bundle.source_files(root)}
            self.assertEqual(selected, set(bundle.FILES))

    def test_listener_gate_accepts_only_expected_services(self):
        for address, owner in [('0.0.0.0:22', 'sshd'), ('127.0.0.53%lo:53', 'systemd-resolve'), ('127.0.0.1:34583', 'containerd')]:
            self.assertTrue(verify.allowed_listener(f'LISTEN 0 4096 {address} 0.0.0.0:* users:(("{owner}",pid=5,fd=3))'))
        for address, owner in [('0.0.0.0:34583', 'containerd'), ('127.0.0.1:8788', 'node'), ('127.0.0.1:2375', 'dockerd'), ('127.0.0.53:53', 'unknown'), ('0.0.0.0:22', 'node')]:
            self.assertFalse(verify.allowed_listener(f'LISTEN 0 4096 {address} 0.0.0.0:* users:(("{owner}",pid=5,fd=3))'))
        self.assertFalse(verify.allowed_listener(''))
        self.assertFalse(verify.allowed_listener('LISTEN 0 4096 0.0.0.0:22 0.0.0.0:*'))

    def test_bootstrap_is_arm_only_and_does_not_launch_agents_or_browsers(self):
        script = (HERE/'bootstrap.sh').read_text()
        self.assertIn('== aarch64', script)
        self.assertIn('cvent-ego-bootstrap.started', script)
        self.assertIn('--ignore-scripts', script)
        self.assertIn('docker pull ghcr.io/steel-dev/steel-browser@sha256:', script)
        self.assertNotIn('docker run', script)
        self.assertNotIn('pi --', script)

    def test_staged_service_requires_explicit_activation_and_never_restarts(self):
        script = (HERE/'stage.sh').read_text()
        self.assertIn('ConditionPathExists=/etc/cvent-ego/activation-approved', script)
        self.assertIn('EnvironmentFile=/etc/cvent-ego/runner.env', script)
        self.assertIn('Restart=no', script)
        self.assertIn('KillMode=control-group', script)
        self.assertIn('UMask=0077', script)
        self.assertNotIn('systemctl start', script)
        self.assertNotIn('systemctl enable', script)
        self.assertNotIn('auth.json', script)

    def test_stage_checks_archive_and_refuses_existing_data(self):
        script = (HERE/'stage.sh').read_text()
        self.assertIn('sha256sum --check --strict', script)
        self.assertIn('extractall(root, filter=\'data\')', script)
        self.assertIn('cvent-ego-stage.started', script)
        self.assertIn('Duplicate archive paths', script)
        self.assertIn('Source hash mismatch', script)
        self.assertIn('Upstream source drift', script)

    def test_snapshot_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'app').mkdir()
            (root/'private.md').write_text('fixture')
            (root/'app/linked.md').symlink_to(root/'private.md')
            with self.assertRaises(ValueError):
                bundle.source_files(root)


if __name__ == '__main__':
    unittest.main()
