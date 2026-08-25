const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const inventoryController = require('../controllers/inventoryController');

const router = express.Router();

router.use(protect);

router.post('/adjust', authorize('stock:adjust', 'product:edit'), inventoryController.adjustStock);
router.post('/warehouses', authorize('stock:transfer', 'product:create', 'settings:manage'), inventoryController.createWarehouse);
router.put('/notifications/read-all', inventoryController.markAllNotificationsRead);
router.put('/notifications/:id/read', inventoryController.markNotificationRead);
router.get('/audit-logs', authorize('audit:view'), inventoryController.getAuditLogs);

module.exports = router;
