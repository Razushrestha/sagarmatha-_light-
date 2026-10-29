const Product = require('../models/Product');
const { assertStorageLimit } = require('../services/planService');
const Brand = require('../models/Brand');
const { createAuditLog } = require('../middleware/audit');
const { tenantKey, cacheGet, cacheSet, invalidateShopCache } = require('../utils/cache');
const {
  getExportRows,
  buildWorkbook,
  toCsv,
  parseSpreadsheetBuffer,
  importRows,
} = require('../utils/productSpreadsheet');
const { scoped, parsePaging, mustBelongToShop } = require('../utils/tenantQuery');
const { compressProductImage, unlinkQuiet } = require('../utils/imageCompress');
const path = require('path');

exports.getProducts = async (req, res) => {
  try {
    const { search, category, brand, lowStock } = req.query;
    const { page, limit, skip } = parsePaging(req.query, { defaultLimit: 50, max: 200 });
    const query = scoped(req, { isActive: true });

    if (search) {
      const matchingBrands = await Brand.find(scoped(req, { name: { $regex: search, $options: 'i' } })).select('_id').lean();
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
        { brand: { $in: matchingBrands.map((b) => b._id) } },
      ];
    }
    if (category) query.category = category;
    if (brand) query.brand = brand;
    if (req.query.pos === '1') {
      query['attrs.role'] = { $nin: ['colorant', 'ingredient'] };
    }
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$currentStock', '$minStock'] };
    }

    const listKey = !search && lowStock !== 'true'
      ? tenantKey(['products', 'list', String(category || ''), String(brand || ''), String(page), String(limit), String(req.query.pos || '')])
      : null;
    if (listKey) {
      const cached = await cacheGet(listKey);
      if (cached) return res.json(cached);
    }

    const findQuery = Product.find(query)
      .populate('category', 'name')
      .populate('brand', 'name')
      .populate('unit', 'name shortName')
      .select('-priceHistory')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);

    const [products, total] = await Promise.all([
      findQuery.lean(),
      Product.countDocuments(query),
    ]);

    const payload = {
      success: true,
      data: products,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit) || 1,
        limit,
      },
    };
    if (listKey) await cacheSet(listKey, payload, 20);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const key = tenantKey(['products', 'id', String(req.params.id)]);
    const cached = await cacheGet(key);
    if (cached) return res.json({ success: true, data: cached });

    const product = await Product.findOne(scoped(req, { _id: req.params.id }))
      .populate('category brand unit purchaseUnit warehouse supplier')
      .lean();
    mustBelongToShop(product, req, 'Product not found.');
    await cacheSet(key, product, 60);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

function generateSku(name) {
  const base = String(name || 'SKU')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18) || 'SKU';
  return `${base}-${Date.now().toString(36).slice(-5)}`.slice(0, 30);
}

exports.createProduct = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.tenantId;
    if (body.attrs && (typeof body.attrs !== 'object' || Array.isArray(body.attrs))) {
      delete body.attrs;
    }
    if (!body.sku || !String(body.sku).trim()) {
      body.sku = generateSku(body.name);
    }
    // Ensure price fields are stored as floats
    for (const key of ['purchasePrice', 'sellingPrice', 'wholesalePrice', 'dealerPrice', 'projectPrice', 'minSellingPrice', 'vatRate', 'commissionPercent']) {
      if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
        body[key] = parseFloat(body[key]);
      }
    }
    const product = await Product.create(body);
    await invalidateShopCache(['products', 'dashboard', 'reports']);
    await createAuditLog(req.user._id, 'create', 'product', product._id, null, { name: product.name, sku: product.sku }, req);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.tenantId;
    if (body.attrs && (typeof body.attrs !== 'object' || Array.isArray(body.attrs))) {
      delete body.attrs;
    }
    // Do not clear SKU from the edit form (field removed from UI)
    if (!body.sku || !String(body.sku).trim()) delete body.sku;
    for (const key of ['purchasePrice', 'sellingPrice', 'wholesalePrice', 'dealerPrice', 'projectPrice', 'minSellingPrice', 'vatRate', 'commissionPercent']) {
      if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
        body[key] = parseFloat(body[key]);
      }
    }
    const oldProduct = await Product.findById(req.params.id);
    const product = await Product.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    await invalidateShopCache(['products', 'dashboard']);
    await createAuditLog(req.user._id, 'update', 'product', product._id, { name: oldProduct.name, price: oldProduct.sellingPrice }, { name: product.name, price: product.sellingPrice }, req);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    await invalidateShopCache(['products', 'dashboard']);
    await createAuditLog(req.user._id, 'delete', 'product', product._id, { name: product.name }, null, req);
    res.json({ success: true, message: 'Product deactivated.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProductByBarcode = async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    const key = tenantKey(['products', 'barcode', code.toLowerCase()]);
    const cached = await cacheGet(key);
    if (cached) return res.json({ success: true, data: cached });

    const product = await Product.findOne(scoped(req, {
      $or: [{ barcode: code }, { sku: code }],
      isActive: true,
    })).populate('category brand unit').lean();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    await cacheSet(key, product, 60);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadImage = async (req, res) => {
  const originalPath = req.file?.path;
  let compressed = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided.' });
    }

    const destDir = path.dirname(originalPath);
    const baseName = path.parse(req.file.filename).name;
    compressed = await compressProductImage(originalPath, destDir, baseName);
    unlinkQuiet(originalPath);

    try {
      await assertStorageLimit(req.tenant, compressed.bytes);
    } catch (error) {
      unlinkQuiet(compressed.fullPath);
      unlinkQuiet(compressed.thumbPath);
      return res.status(error.statusCode || 403).json({ success: false, message: error.message });
    }

    const url = `/uploads/tenants/${req.tenantId}/${compressed.fullName}`;
    const thumb = `/uploads/tenants/${req.tenantId}/${compressed.thumbName}`;
    res.json({ success: true, data: { url, thumb } });
  } catch (error) {
    unlinkQuiet(originalPath);
    if (compressed) {
      unlinkQuiet(compressed.fullPath);
      unlinkQuiet(compressed.thumbPath);
    }
    const message = /unsupported|corrupt|Input file/i.test(error.message)
      ? 'Could not read that image. Use JPG, PNG, or WEBP.'
      : error.message;
    res.status(400).json({ success: false, message });
  }
};

exports.exportProducts = async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const rows = await getExportRows();
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const csv = toCsv(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="products-${stamp}.csv"`);
      return res.send(csv);
    }

    const workbook = await buildWorkbook(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="products-${stamp}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.downloadImportTemplate = async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const sample = [{
      name: '2.5mm Copper Wire (Per Meter)',
      sku: 'WR-250-CU',
      barcode: '',
      category: 'Wires & Cables',
      brand: 'Finolex',
      purchasePrice: 45,
      sellingPrice: 65,
      wholesalePrice: '',
      minStock: 5,
      currentStock: 100,
      status: 'Active',
      model: '',
      description: '',
    }];

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.csv"');
      return res.send(toCsv(sample));
    }

    const workbook = await buildWorkbook(sample);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.importProducts = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: 'Choose a CSV or Excel file to import.' });
    }

    const rawRows = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    const result = await importRows(rawRows);
    await invalidateShopCache(['products', 'dashboard']);
    await createAuditLog(
      req.user._id,
      'update',
      'product',
      req.user._id,
      null,
      { created: result.created, updated: result.updated, errors: result.errors.length },
      req
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
