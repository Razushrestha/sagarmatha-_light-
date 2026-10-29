const express = require('express');
const { protect, authorize, requireShopTenant } = require('../middleware/auth');
const { requireModule } = require('../middleware/requireModule');
const shiftController = require('../controllers/shiftController');

const router = express.Router();

router.use(protect, requireShopTenant, requireModule('shifts'));

router.get('/current', authorize('pos:access', 'reports:view'), shiftController.getCurrent);
router.get('/', authorize('pos:access', 'reports:view', 'accounting:read'), shiftController.list);
router.post('/open', authorize('pos:access'), shiftController.open);
router.post('/:id/close', authorize('pos:access', 'accounting:write'), shiftController.close);

module.exports = router;
