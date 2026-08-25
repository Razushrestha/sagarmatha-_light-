const mongoose = require('mongoose');

const electricianSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  number1: { type: String, required: true, trim: true },
  number2: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  commissionPercent: { type: Number, default: 5, min: 0, max: 100 },
  commissionReceived: [{
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
  }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

electricianSchema.index({ name: 1 });
electricianSchema.index({ number1: 1 });

module.exports = mongoose.model('Electrician', electricianSchema);
