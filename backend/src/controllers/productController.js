const Product = require('../models/Product');
const { createAuditLog } = require('../middleware/audit');
const {
  getExportRows,
  buildWorkbook,
  toCsv,
  parseSpreadsheetBuffer,
  importRows,
} = require('../utils/productSpreadsheet');

exports.getProducts = async (req, res) => {
  try {
    const { search, category, brand, page = 1, limit = 20, lowStock } = req.query;
    const query = { isActive: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) query.category = category;
    if (brand) query.brand = brand;
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$currentStock', '$minStock'] };
    }

    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name')
        .populate('brand', 'name')
        .populate('unit', 'name shortName')
        .select('-priceHistory')
        .sort({ name: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Product.countDocuments(query),
    ]);

    res.json({ success: true, data: products, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category brand unit purchaseUnit warehouse supplier');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);
    await createAuditLog(req.user._id, 'create', 'product', product._id, null, { name: product.name, sku: product.sku }, req);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const oldProduct = await Product.findById(req.params.id);
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
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
    await createAuditLog(req.user._id, 'delete', 'product', product._id, { name: product.name }, null, req);
    res.json({ success: true, message: 'Product deactivated.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProductByBarcode = async (req, res) => {
  try {
    const product = await Product.findOne({
      $or: [{ barcode: req.params.code }, { sku: req.params.code }],
      isActive: true,
    }).populate('category brand unit');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided.' });
    }
    const url = `/uploads/products/${req.file.filename}`;
    res.json({ success: true, data: { url } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
