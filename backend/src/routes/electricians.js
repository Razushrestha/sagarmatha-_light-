const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const electricianController = require('../controllers/electricianController');

const router = express.Router();

router.use(protect);

router.get('/', authorize('customer:read', 'pos:access'), electricianController.getElectricians);
router.post('/', authorize('customer:create', 'customer:edit', 'pos:access'), electricianController.createElectrician);
router.get('/:id/commission', authorize('customer:read', 'pos:access', 'accounting:read'), electricianController.getCommission);
router.post('/:id/commission-received', authorize('customer:edit', 'customer:create', 'accounting:write'), electricianController.receiveCommission);
router.put('/:id', authorize('customer:edit', 'customer:create', 'pos:access'), electricianController.updateElectrician);
router.delete('/:id', authorize('customer:edit', 'customer:create'), electricianController.deleteElectrician);

module.exports = router;
