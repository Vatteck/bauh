import unittest
from unittest.mock import Mock
from bauh.view.web.api import BauhApi

class BauhApiOrphansTest(unittest.TestCase):
    def setUp(self):
        self.manager = Mock()
        self.logger = Mock()
        self.api = BauhApi(self.manager, self.logger)

    def test_get_orphans_success(self):
        # Prepare mock packages
        pkg_orphan = Mock()
        pkg_orphan.orphan = True
        pkg_orphan.name = "orphan-pkg"
        pkg_orphan.description = "an orphan"
        pkg_orphan.version = "1.0"
        pkg_orphan.latest_version = "1.0"
        pkg_orphan.installed = True
        pkg_orphan.update = False
        pkg_orphan.icon_url = None
        pkg_orphan.publisher = None
        pkg_orphan.size = 100
        pkg_orphan.categories = []
        pkg_orphan.get_publisher = Mock(return_value=None)
        pkg_orphan.get_type = Mock(return_value="Flatpak")

        pkg_regular = Mock()
        pkg_regular.orphan = False
        pkg_regular.name = "regular-pkg"
        
        # Package with no orphan attribute
        pkg_no_attr = Mock(spec=[]) 
        pkg_no_attr.name = "no-attr"

        installed_result = Mock()
        installed_result.installed = [pkg_orphan, pkg_regular, pkg_no_attr]
        self.manager.read_installed.return_value = installed_result

        res = self.api.get_orphans()
        self.assertEqual(res['status'], 'ok')
        self.assertEqual(len(res['data']), 1)
        self.assertEqual(res['data'][0]['name'], 'orphan-pkg')
        self.manager.read_installed.assert_called_once()

    def test_get_orphans_error(self):
        self.manager.read_installed.side_effect = Exception("Read failed")
        res = self.api.get_orphans()
        self.assertEqual(res['status'], 'error')
        self.assertIn("Read failed", res['message'])
