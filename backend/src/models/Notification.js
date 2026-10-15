const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: ['low_stock', 'out_of_stock', 'overdue_payment', 'pending_approval', 'new_order', 'payment_received', 'supplier_due', 'warranty_expiry'],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: { type: String },
  isRead: { type: Boolean, default: false },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
}, { timestamps: true });

applyTenantPlugin(notificationSchema);
notificationSchema.index({ tenantId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
