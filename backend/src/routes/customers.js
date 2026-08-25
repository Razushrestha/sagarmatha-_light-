const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const customerController = require('../controllers/customerController');

const router = express.Router();

router.use(protect);

router.get('/debtors', authorize('customer:read', 'accounting:read', 'pos:access'), customerController.getDebtors);
router.get('/credit', authorize('customer:read', 'accounting:read', 'pos:access'), customerController.getCreditCustomers);
router.get('/', authorize('customer:read', 'pos:access'), customerController.getCustomers);
router.post('/', authorize('customer:create', 'pos:access'), customerController.createCustomer);
router.get('/:id/ledger', authorize('customer:read', 'accounting:read', 'pos:access'), customerController.getCustomerLedger);
router.post('/:id/payments', authorize('accounting:write', 'customer:edit'), customerController.receivePayment);
router.post('/:id/credit/refund', authorize('accounting:write', 'customer:edit'), customerController.refundCredit);
router.get('/:id', authorize('customer:read', 'pos:access'), customerController.getCustomer);
router.put('/:id', authorize('customer:edit'), customerController.updateCustomer);

module.exports = router;
