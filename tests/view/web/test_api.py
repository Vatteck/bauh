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

    def test_serialize_pkg_registry_eviction(self):
        # Setup mock package
        pkg = Mock()
        pkg.name = "test-pkg"
        pkg.description = "desc"
        pkg.version = "1.0"
        pkg.latest_version = "1.0"
        pkg.installed = True
        pkg.update = False
        pkg.icon_url = None
        pkg.publisher = None
        pkg.size = 100
        pkg.categories = []
        pkg.get_publisher = Mock(return_value=None)
        pkg.get_type = Mock(return_value="Flatpak")

        # Populate registry to 2000 elements
        for i in range(2000):
            self.api.pkg_registry[str(i)] = Mock()

        self.assertEqual(len(self.api.pkg_registry), 2000)

        # Serialize one more package (registry size is 2000, not exceeding 2000 yet)
        res = self.api._serialize_pkg(pkg)
        pkg_id = res['id']
        self.assertEqual(len(self.api.pkg_registry), 2001)
        self.assertIn(pkg_id, self.api.pkg_registry)

        # Now force the registry size to 2005 (exceeding 2000)
        for i in range(2000, 2005):
            self.api.pkg_registry[str(i)] = Mock()

        self.assertEqual(len(self.api.pkg_registry), 2006)

        # Serialize one more package, it should trigger eviction (clear) and then add itself
        res2 = self.api._serialize_pkg(pkg)
        pkg_id2 = res2['id']
        self.assertEqual(len(self.api.pkg_registry), 1)
        self.assertIn(pkg_id2, self.api.pkg_registry)


class BauhApiPinTest(unittest.TestCase):
    def setUp(self):
        self.manager = Mock()
        self.logger = Mock()
        self.api = BauhApi(self.manager, self.logger)
        
        self.pkg = Mock()
        self.pkg.name = "test-pin-pkg"
        self.api.pkg_registry["test-id"] = self.pkg

    def test_pin_update_success(self):
        res = self.api.pin_update("test-id")
        self.assertEqual(res, {'status': 'ok', 'success': True})
        self.manager.ignore_update.assert_called_once_with(self.pkg)

    def test_pin_update_not_found(self):
        res = self.api.pin_update("unknown-id")
        self.assertEqual(res['status'], 'error')
        self.assertIn("Unknown package id", res['message'])

    def test_pin_update_error(self):
        self.manager.ignore_update.side_effect = Exception("Pin failed")
        res = self.api.pin_update("test-id")
        self.assertEqual(res['status'], 'error')
        self.assertIn("Pin failed", res['message'])

    def test_unpin_update_success(self):
        res = self.api.unpin_update("test-id")
        self.assertEqual(res, {'status': 'ok', 'success': True})
        self.manager.revert_ignored_update.assert_called_once_with(self.pkg)

    def test_unpin_update_not_found(self):
        res = self.api.unpin_update("unknown-id")
        self.assertEqual(res['status'], 'error')
        self.assertIn("Unknown package id", res['message'])

    def test_unpin_update_error(self):
        self.manager.revert_ignored_update.side_effect = Exception("Unpin failed")
        res = self.api.unpin_update("test-id")
        self.assertEqual(res['status'], 'error')
        self.assertIn("Unpin failed", res['message'])

