const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const saleController = require('../controllers/saleController');

const router = express.Router();

router.use(protect);

// Static paths first. Never place these after /:id
router.get('/dashboard', authorize('reports:view', 'pos:access', 'invoice:read'), saleController.getDashboardStats);
router.get('/held', authorize('pos:access', 'invoice:read'), saleController.getHeldSales);
router.get('/returns', authorize('invoice:read', 'pos:access'), saleController.getReturns);
router.get('/returns/:returnId', authorize('invoice:read', 'pos:access'), saleController.getReturn);
router.post('/returns/batch', authorize('invoice:create', 'pos:access'), saleController.createReturnsBatch);
router.get('/', authorize('invoice:read', 'pos:access'), saleController.getSales);
router.post('/', authorize('invoice:create', 'pos:access'), saleController.createSale);
router.get('/:id', authorize('invoice:read', 'pos:access'), saleController.getSale);
router.post('/:id/convert', authorize('invoice:create', 'pos:access'), saleController.convertToSale);
router.post('/:id/return', authorize('invoice:create', 'pos:access'), saleController.createReturn);
router.put('/:id/complete', authorize('pos:access', 'invoice:create'), saleController.completeHeldSale);

module.exports = router;
