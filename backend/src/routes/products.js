const express = require('express');
const { protect, authorize, requireShopTenant } = require('../middleware/auth');
const productController = require('../controllers/productController');
const { upload, spreadsheetUpload, handleUploadError } = require('../middleware/upload');

const router = express.Router();

router.use(protect, requireShopTenant);

router.get('/', authorize('product:read', 'pos:access'), productController.getProducts);
router.get('/export', authorize('product:read', 'pos:access'), productController.exportProducts);
router.get('/import-template', authorize('product:read', 'product:create', 'product:edit'), productController.downloadImportTemplate);
router.post(
  '/import',
  authorize('product:create', 'product:edit'),
  spreadsheetUpload.single('file'),
  productController.importProducts
);
router.get('/barcode/:code', authorize('product:read', 'pos:access'), productController.getProductByBarcode);
router.post(
  '/upload-image',
  authorize('product:create', 'product:edit'),
  upload.single('image'),
  handleUploadError,
  productController.uploadImage
);
router.post('/', authorize('product:create'), productController.createProduct);
router.get('/:id', authorize('product:read', 'pos:access'), productController.getProduct);
router.put('/:id', authorize('product:edit'), productController.updateProduct);
router.delete('/:id', authorize('product:delete'), productController.deleteProduct);

module.exports = router;
