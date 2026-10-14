const Category = require('../models/Category');
const Brand = require('../models/Brand');
const { Unit } = require('../models/Unit');
const { Warehouse, StockMovement } = require('../models/Warehouse');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const Product = require('../models/Product');

exports.getCategories = async (req, res) => {
  const categories = await Category.find({ isActive: true }).populate('parent', 'name').lean();
  res.json({ success: true, data: categories });
};

exports.createCategory = async (req, res) => {
  const category = await Category.create(req.body);
  res.status(201).json({ success: true, data: category });
};

exports.updateCategory = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required.' });
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, description: req.body.description },
      { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const inUse = await Product.countDocuments({ category: req.params.id, isActive: true });
    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${inUse} product(s) still use this category.`,
      });
    }
    const category = await Category.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    res.json({ success: true, message: 'Category deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBrands = async (req, res) => {
  const brands = await Brand.find({ isActive: true }).lean();
  res.json({ success: true, data: brands });
};

exports.createBrand = async (req, res) => {
  const brand = await Brand.create(req.body);
  res.status(201).json({ success: true, data: brand });
};

exports.updateBrand = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Brand name is required.' });
    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      { name, description: req.body.description },
      { new: true, runValidators: true }
    );
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found.' });
    res.json({ success: true, data: brand });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A brand with this name already exists.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBrand = async (req, res) => {
  try {
    const inUse = await Product.countDocuments({ brand: req.params.id, isActive: true });
    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${inUse} product(s) still use this brand.`,
      });
    }
    const brand = await Brand.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found.' });
    res.json({ success: true, message: 'Brand deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUnits = async (req, res) => {
  const units = await Unit.find({ isActive: true }).lean();
  res.json({ success: true, data: units });
};

exports.getWarehouses = async (req, res) => {
  const warehouses = await Warehouse.find({ isActive: true }).sort({ isDefault: -1, name: 1 }).lean();
  res.json({ success: true, data: warehouses });
};

exports.getStockMovements = async (req, res) => {
  const { product, page = 1, limit = 50 } = req.query;
  const query = product ? { product } : {};
  const skip = (page - 1) * limit;
  const movements = await StockMovement.find(query)
    .populate('product', 'name sku')
    .populate('warehouse', 'name')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();
  res.json({ success: true, data: movements });
};

exports.getSettings = async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  res.json({ success: true, data: settings });
};

exports.updateSettings = async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create(req.body);
  else settings = await Settings.findByIdAndUpdate(settings._id, req.body, { new: true });
  res.json({ success: true, data: settings });
};

exports.getNotifications = async (req, res) => {
  const notifications = await Notification.find()
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({ success: true, data: notifications });
};

exports.globalSearch = async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ success: true, data: { products: [], customers: [], sales: [] } });

  const Customer = require('../models/Customer');
  const Sale = require('../models/Sale');

  const [products, customers, sales] = await Promise.all([
    Product.find({
      isActive: true,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
        { barcode: { $regex: q, $options: 'i' } },
      ],
    }).limit(10).select('name sku sellingPrice currentStock').lean(),
    Customer.find({
      isActive: true,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ],
    }).limit(10).select('name phone outstanding').lean(),
    Sale.find({
      $or: [
        { invoiceNumber: { $regex: q, $options: 'i' } },
        { customerName: { $regex: q, $options: 'i' } },
      ],
    }).limit(10).select('invoiceNumber total customerName createdAt').lean(),
  ]);

  res.json({ success: true, data: { products, customers, sales } });
};
