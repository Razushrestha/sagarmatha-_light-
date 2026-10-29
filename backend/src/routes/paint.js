const express = require('express');
const { protect, authorize, requireShopTenant } = require('../middleware/auth');
const { requireModule } = require('../middleware/requireModule');
const paintController = require('../controllers/paintController');

const router = express.Router();

router.use(protect, requireShopTenant, requireModule('tinting'));

router.get('/shades', authorize('product:read', 'pos:access'), paintController.listShades);
router.post('/shades', authorize('product:create', 'product:edit'), paintController.createShade);
router.put('/shades/:id', authorize('product:edit', 'product:create'), paintController.updateShade);
router.delete('/shades/:id', authorize('product:delete', 'product:edit'), paintController.removeShade);
router.get('/mix/preview', authorize('pos:access', 'product:read'), paintController.previewMix);
router.post('/mix/preview', authorize('pos:access', 'product:read'), paintController.previewMix);
router.post('/mix', authorize('pos:access', 'product:create'), paintController.mix);
router.get('/lots', authorize('product:read', 'stock:adjust'), paintController.listLots);
router.get('/challans', authorize('invoice:read', 'purchase:read'), paintController.listChallans);
router.post('/challans', authorize('invoice:create', 'purchase:create'), paintController.createChallan);
router.get('/challans/:id', authorize('invoice:read', 'purchase:read'), paintController.getChallan);
router.post('/challans/:id/dispatch', authorize('invoice:create', 'stock:adjust'), paintController.dispatchChallan);
router.post('/challans/:id/deliver', authorize('invoice:create'), paintController.deliverChallan);

module.exports = router;
