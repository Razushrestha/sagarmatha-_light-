const { createAuditLog } = require('../middleware/audit');
const { withOptionalTransaction } = require('../utils/mongoTransaction');
const { invalidateShopCache } = require('../utils/cache');
const { changeStock } = require('../utils/stock');
const { parsePaging, scoped } = require('../utils/tenantQuery');

exports.adjustStock = async (req, res) => {
  try {
    const { productId, warehouseId, quantity, type, reason } = req.body;

    if (!productId || !warehouseId || !quantity || !type) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const result = await withOptionalTransaction(async (session) => {
      const movementType = type === 'add' ? 'adjustment_plus' : 'adjustment_minus';
      const qtyChange = type === 'add' ? Math.abs(quantity) : -Math.abs(quantity);
      const refNum = `ADJ-${Date.now()}`;

      const product = await changeStock({
        productId,
        productName: 'item',
        delta: qtyChange,
        session,
        warehouseId,
        type: movementType,
        reference: refNum,
        userId: req.user._id,
        notes: reason,
      });

      await createAuditLog(req.user._id, 'stock_adjust', 'product', productId, null, { qtyChange, reason }, req);

      return { product, reference: refNum };
    });

    await invalidateShopCache(['products', 'dashboard', 'reports']);
    res.json({ success: true, data: result });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404
      : /Insufficient stock/i.test(error.message) ? 400
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
    const row = await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    if (!row) return res.status(404).json({ success: false, message: 'Notification not found.' });
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
    const { page, limit, skip } = parsePaging(req.query, { defaultLimit: 50 });
    const filter = scoped(req);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).populate('user', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ success: true, data: logs, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
