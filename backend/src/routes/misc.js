const express = require('express');
const { protect, authorize, requireShopTenant } = require('../middleware/auth');
const miscController = require('../controllers/miscController');

const router = express.Router();

router.use(protect, requireShopTenant);

router.get('/categories', miscController.getCategories);
router.post('/categories', authorize('product:create'), miscController.createCategory);
router.put('/categories/:id', authorize('product:edit', 'product:create'), miscController.updateCategory);
router.delete('/categories/:id', authorize('product:delete', 'product:edit', 'product:create'), miscController.deleteCategory);
router.get('/brands', miscController.getBrands);
router.post('/brands', authorize('product:create'), miscController.createBrand);
router.put('/brands/:id', authorize('product:edit', 'product:create'), miscController.updateBrand);
router.delete('/brands/:id', authorize('product:delete', 'product:edit', 'product:create'), miscController.deleteBrand);
router.get('/units', miscController.getUnits);
router.get('/warehouses', miscController.getWarehouses);
router.get('/stock-movements', authorize('product:read', 'stock:adjust', 'pos:access'), miscController.getStockMovements);
router.get('/settings', authorize('settings:manage', 'invoice:read', 'pos:access', 'reports:view', 'product:read'), miscController.getSettings);
router.put('/settings', authorize('settings:manage'), miscController.updateSettings);
router.get('/notifications', miscController.getNotifications);
router.get('/search', miscController.globalSearch);

module.exports = router;
