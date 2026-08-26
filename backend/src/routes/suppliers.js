const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const supplierController = require('../controllers/supplierController');

const router = express.Router();

router.use(protect);

router.get('/payments', authorize('purchase:read', 'accounting:read'), supplierController.getSupplierPayments);
router.post('/payments', authorize('purchase:create', 'accounting:write'), supplierController.createSupplierPayment);
router.get('/purchases', authorize('purchase:read'), supplierController.getPurchases);
router.post('/purchases', authorize('purchase:create'), supplierController.createPurchase);
router.get('/purchases/:purchaseId', authorize('purchase:read'), supplierController.getPurchase);
router.post('/purchases/:purchaseId/receive', authorize('purchase:create'), supplierController.receivePurchaseOrder);
router.post('/purchases/:purchaseId/return', authorize('purchase:create'), supplierController.createPurchaseReturn);
router.get('/returns', authorize('purchase:read'), supplierController.getPurchaseReturns);

router.get('/', authorize('purchase:read'), supplierController.getSuppliers);
router.post('/', authorize('purchase:create'), supplierController.createSupplier);
router.get('/:id', authorize('purchase:read'), supplierController.getSupplier);
router.put('/:id', authorize('purchase:edit', 'purchase:create'), supplierController.updateSupplier);
router.delete('/:id', authorize('purchase:edit', 'purchase:create'), supplierController.deleteSupplier);

module.exports = router;
