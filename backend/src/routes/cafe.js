const express = require('express');
const { protect, authorize, requireShopTenant } = require('../middleware/auth');
const { requireModule } = require('../middleware/requireModule');
const cafeController = require('../controllers/cafeController');

const router = express.Router();

router.use(protect, requireShopTenant, requireModule('recipes'));

router.get('/menu', authorize('product:read', 'pos:access'), cafeController.listMenu);
router.get('/margins', authorize('reports:view', 'profit:view', 'product:read'), cafeController.recipeMargins);
router.put('/recipes/:id', authorize('product:edit', 'product:create'), cafeController.saveRecipe);
router.post('/waste', authorize('pos:access', 'stock:adjust', 'product:edit'), cafeController.bookWaste);

router.get('/tables', requireModule('tables'), authorize('pos:access', 'invoice:read'), cafeController.listTables);
router.post('/tables', requireModule('tables'), authorize('settings:manage', 'product:create'), cafeController.createTable);
router.put('/tables/:id', requireModule('tables'), authorize('settings:manage', 'product:edit'), cafeController.updateTable);

router.get('/price-rules', authorize('pos:access', 'settings:manage', 'product:read'), cafeController.listPriceRules);
router.post('/price-rules', authorize('settings:manage'), cafeController.savePriceRule);
router.put('/price-rules/:id', authorize('settings:manage'), cafeController.savePriceRule);
router.delete('/price-rules/:id', authorize('settings:manage'), cafeController.removePriceRule);

module.exports = router;
