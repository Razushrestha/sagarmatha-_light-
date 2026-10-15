const express = require('express');
const { protect, requirePlatformAdmin } = require('../middleware/auth');
const platformController = require('../controllers/platformController');

const router = express.Router();

router.use(protect, requirePlatformAdmin);

router.get('/metrics', platformController.getMetrics);
router.post('/alerts/test', platformController.testAlert);
router.get('/backups', platformController.listBackups);
router.post('/backups/run', platformController.runBackup);
router.get('/settings', platformController.getSettings);
router.put('/settings', platformController.updateSettings);
router.get('/admins', platformController.listAdmins);
router.post('/admins', platformController.createAdmin);
router.put('/admins/:id', platformController.updateAdmin);
router.get('/support-log', platformController.listSupportLog);
router.get('/tenants', platformController.listTenants);
router.get('/tenants/export', platformController.exportTenants);
router.post('/tenants', platformController.createTenant);
router.get('/tenants/:id', platformController.getTenant);
router.get('/tenants/:id/snapshot', platformController.getSnapshot);
router.post('/tenants/:id/invite', platformController.inviteOwner);
router.put('/tenants/:id', platformController.updateTenant);
router.post('/tenants/:id/lifecycle', platformController.lifecycle);
router.post('/tenants/:id/reset-owner-password', platformController.resetOwnerPassword);
router.post('/tenants/:id/impersonate', platformController.impersonate);
router.post('/stop-impersonate', platformController.stopImpersonate);

module.exports = router;

