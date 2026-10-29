const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const accountSchema = new mongoose.Schema({
  code: { type: String, required: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['asset', 'liability', 'equity', 'income', 'expense', 'cogs', 'tax'],
    required: true,
  },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  balance: { type: Number, default: 0 },
  isSystem: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const journalEntrySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  reference: { type: String },
  referenceId: { type: mongoose.Schema.Types.ObjectId },
  folioId: { type: mongoose.Schema.Types.ObjectId, default: null },
  source: { type: String, enum: ['shop_sale', 'mix', 'cafe_ticket', 'room'] },
  description: { type: String, required: true },
  entries: [{
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

applyTenantPlugin(accountSchema, { uniqueFields: ['code'] });
applyTenantPlugin(journalEntrySchema);

const Account = mongoose.model('Account', accountSchema);
const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);

module.exports = { Account, JournalEntry };
