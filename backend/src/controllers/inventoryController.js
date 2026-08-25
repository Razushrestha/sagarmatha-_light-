const mongoose = require('mongoose');
const Product = require('../models/Product');
const { StockMovement } = require('../models/Warehouse');
const { createAuditLog } = require('../middleware/audit');
const { withOptionalTransaction, sessionQuery, sessionOpts } = require('../utils/mongoTransaction');

exports.adjustStock = async (req, res) => {
  try {
    const { productId, warehouseId, quantity, type, reason } = req.body;

    if (!productId || !warehouseId || !quantity || !type) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const result = await withOptionalTransaction(async (session) => {
      const product = await sessionQuery(Product.findById(productId), session);
      if (!product) throw new Error('Product not found.');

      const movementType = type === 'add' ? 'adjustment_plus' : 'adjustment_minus';
      const qtyChange = type === 'add' ? Math.abs(quantity) : -Math.abs(quantity);

      if (type === 'remove' && product.currentStock < Math.abs(quantity)) {
        throw new Error('Insufficient stock for adjustment.');
      }

      product.currentStock += qtyChange;
      await product.save(sessionOpts(session));

      const refNum = `ADJ-${String(await StockMovement.countDocuments() + 1).padStart(5, '0')}`;

      await StockMovement.create([{
        product: productId,
        warehouse: warehouseId,
        type: movementType,
        quantity: qtyChange,
        balanceAfter: product.currentStock,
        reference: refNum,
        notes: reason,
        createdBy: req.user._id,
      }], sessionOpts(session));

      await createAuditLog(req.user._id, 'stock_adjust', 'product', productId, null, { qtyChange, reason }, req);

      return { product, reference: refNum };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.message === 'Product not found.' ? 404
      : error.message === 'Insufficient stock for adjustment.' ? 400
        : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

exports.createWarehouse = async (req, res) => {
  try {
    const { Warehouse } = require('../models/Warehouse');
    const warehouse = await Warehouse.create(req.body);
    res.status(201).json({ success: true, data: warehouse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    await Notification.updateMany({ isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const AuditLog = require('../models/AuditLog');
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AuditLog.find().populate('user', 'name email').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      AuditLog.countDocuments(),
    ]);
    res.json({ success: true, data: logs, pagination: { total, page: Number(page) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
