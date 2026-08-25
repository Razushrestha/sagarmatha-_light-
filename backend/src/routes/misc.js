const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const miscController = require('../controllers/miscController');

const router = express.Router();

router.use(protect);

router.get('/categories', miscController.getCategories);
router.post('/categories', authorize('product:create'), miscController.createCategory);
router.get('/brands', miscController.getBrands);
router.post('/brands', authorize('product:create'), miscController.createBrand);
router.get('/units', miscController.getUnits);
router.get('/warehouses', miscController.getWarehouses);
router.get('/stock-movements', authorize('product:read', 'stock:adjust', 'pos:access'), miscController.getStockMovements);
router.get('/settings', authorize('settings:manage', 'invoice:read', 'pos:access', 'reports:view'), miscController.getSettings);
router.put('/settings', authorize('settings:manage'), miscController.updateSettings);
router.get('/notifications', miscController.getNotifications);
router.get('/search', miscController.globalSearch);

module.exports = router;
