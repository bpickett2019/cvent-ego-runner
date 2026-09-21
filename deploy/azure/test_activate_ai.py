import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('activate_ai',Path(__file__).with_name('activate-ai.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ActivationTests(unittest.TestCase):
    def preview(self, **changes):
        job={'id':'test','requestedEventName':'STAGING PREVIEW USER 1 - NO BUILD','originalName':'staging-preview.xlsx','status':'RUNNING','phase':'AWAITING_INPUT','waitingFor':'setup','piCostUSD':0,**changes}
        return [{'executionEnabled':False,'ownership':'USER','budget':{'spentUSD':0}},[{'id':'test'}],job]
    def test_only_idle_synthetic_preview_is_accepted(self):
        with patch.object(module,'get',side_effect=self.preview()):
            self.assertEqual(module.disabled_preview(8788)[1]['id'],'test')
        for changes in [{'sessionId':'paid'},{'ownedPid':12},{'piCostUSD':1},{'requestedEventName':'Real event'},{'originalName':'real-rr.xlsx'},{'waitingFor':'question'},{'status':'STOPPING'}]:
            with self.subTest(changes=changes),patch.object(module,'get',side_effect=self.preview(**changes)),self.assertRaises(AssertionError):module.disabled_preview(8788)
    def test_no_upgrade_over_live_execution(self):
        for field,value in [('executionEnabled',True),('ownership','AGENT'),('budget',{'spentUSD':1})]:
            responses=self.preview();responses[0][field]=value
            with self.subTest(field=field),patch.object(module,'get',side_effect=responses),self.assertRaises(AssertionError):module.disabled_preview(8788)
    def test_atomic_private_file_update_retains_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'receipt.json'
            module.private_write(path,b'one');module.private_write(path,b'two')
            self.assertEqual(path.read_bytes(),b'two');self.assertEqual(path.stat().st_mode&0o777,0o600)
            path.with_name(path.name+'.ai-activation-new').write_text('ambiguous')
            with self.assertRaises(FileExistsError):module.private_write(path,b'three')
            self.assertEqual(path.read_bytes(),b'two')
