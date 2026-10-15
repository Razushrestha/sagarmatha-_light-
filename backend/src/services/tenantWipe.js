const fs = require('fs');
const Product = require('../models/Product');
const { Account, JournalEntry } = require('../models/Account');
const { Unit, UnitConversion } = require('../models/Unit');
const { Warehouse, StockMovement } = require('../models/Warehouse');
const Brand = require('../models/Brand');
const Category = require('../models/Category');
const Customer = require('../models/Customer');
const CustomerPayment = require('../models/CustomerPayment');
const Supplier = require('../models/Supplier');
const SupplierPayment = require('../models/SupplierPayment');
const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const Purchase = require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn');
const Expense = require('../models/Expense');
const Electrician = require('../models/Electrician');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const Settings = require('../models/Settings');
const Role = require('../models/Role');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { tenantUploadDir } = require('../utils/storageUsage');

const TENANT_MODELS = [
  Product, Account, JournalEntry, Unit, UnitConversion, Warehouse, StockMovement,
  Brand, Category, Customer, CustomerPayment, Supplier, SupplierPayment,
  Sale, SaleReturn, Purchase, PurchaseReturn, Expense, Electrician,
  Notification, AuditLog, Settings, Role,
];

async function wipeTenantData(tenantId) {
  const filter = { tenantId };
  for (const Model of TENANT_MODELS) {
    await Model.deleteMany(filter);
  }
  await User.deleteMany({ tenantId, role: { $ne: 'platform_admin' } });
  const uploadDir = tenantUploadDir(tenantId);
  fs.rmSync(uploadDir, { recursive: true, force: true });
  await Tenant.deleteOne({ _id: tenantId });
}

module.exports = { wipeTenantData };
