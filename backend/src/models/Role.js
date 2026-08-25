const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String },
  permissions: [{ type: String }],
  landingPage: { type: String, default: '/dashboard' },
  isSystem: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);
