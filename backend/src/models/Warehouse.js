const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true },
  address: { type: String },
  phone: { type: String },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const stockMovementSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  type: {
    type: String,
    enum: ['opening', 'purchase', 'sale', 'sale_return', 'purchase_return', 'adjustment_plus', 'adjustment_minus', 'damage', 'transfer_in', 'transfer_out'],
    required: true,
  },
  quantity: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  reference: { type: String },
  referenceId: { type: mongoose.Schema.Types.ObjectId },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ product: 1, createdAt: -1 });

const Warehouse = mongoose.model('Warehouse', warehouseSchema);
const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

module.exports = { Warehouse, StockMovement };
