import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-gateway.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class CaddyCutoverTests(unittest.TestCase):
    def original(self):
        proxy = 'reverse_proxy 127.0.0.1:8877 {\n\t\t\theader_up -Authorization\n\t\t}'
        return ('staging.example.test {\n\thandle_path /pi/* { respond "offline" 503 }\n'
                '\thandle @viewer_websocket {\n\t\t' + proxy + '\n\t}\n'
                '\thandle {\n\t\tbasicauth { operator TEST_HASH_NOT_A_CREDENTIAL }\n\t\t' + proxy + '\n\t}\n}\n')

    def test_only_catchall_proxy_remains_and_existing_auth_is_preserved(self):
        result = publisher.candidate_caddy(self.original())
        self.assertIn('basicauth { operator TEST_HASH_NOT_A_CREDENTIAL }', result)
        self.assertIn('handle_path /pi/* { respond "offline" 503 }', result)
        self.assertIn('respond "Retired dashboard viewer" 410', result)
        self.assertEqual(result.count('reverse_proxy'), 1)
        self.assertIn('reverse_proxy 127.0.0.1:8890', result)
        self.assertIn('header_up X-Cvent-Staging-User {http.auth.user.id}', result)
        self.assertIn('header_up -Authorization', result)
        self.assertNotIn('127.0.0.1:8877', result)

    def test_changed_upstream_refuses_broad_replacement(self):
        with self.assertRaises(AssertionError):
            publisher.candidate_caddy(self.original().replace('127.0.0.1:8877', '127.0.0.1:9999', 1))

    def test_already_replaced_config_is_not_replayed(self):
        with self.assertRaises(AssertionError):
            publisher.candidate_caddy(publisher.candidate_caddy(self.original()))


if __name__ == '__main__':
    unittest.main()
