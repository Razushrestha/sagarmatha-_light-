const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  shortName: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const unitConversionSchema = new mongoose.Schema({
  fromUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  toUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  factor: { type: Number, required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
}, { timestamps: true });

const Unit = mongoose.model('Unit', unitSchema);
const UnitConversion = mongoose.model('UnitConversion', unitConversionSchema);

module.exports = { Unit, UnitConversion };
