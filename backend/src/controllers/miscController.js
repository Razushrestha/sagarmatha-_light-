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

exports.getBrands = async (req, res) => {
  const brands = await Brand.find({ isActive: true }).lean();
  res.json({ success: true, data: brands });
};

exports.createBrand = async (req, res) => {
  const brand = await Brand.create(req.body);
  res.status(201).json({ success: true, data: brand });
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
