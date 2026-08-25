const mongoose = require('mongoose');
const { ensureDefaultWarehouse } = require('../utils/warehouse');
const { reconcileAllDebtors } = require('../utils/salePayments');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: Number(process.env.MONGO_POOL_SIZE || 20),
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    await ensureDefaultWarehouse();

    const runStartupSync = process.env.ENABLE_STARTUP_SYNC === 'true'
      || process.env.NODE_ENV !== 'production';

    if (runStartupSync) {
      setImmediate(() => {
        const Customer = require('../models/Customer');
        const Sale = require('../models/Sale');
        const CustomerPayment = require('../models/CustomerPayment');
        reconcileAllDebtors(Customer, Sale, CustomerPayment).catch((err) => {
          console.error('Background debtor reconcile failed:', err.message);
        });

        const { syncSupplierLedgerAmounts } = require('../controllers/supplierController');
        if (typeof syncSupplierLedgerAmounts === 'function') {
          syncSupplierLedgerAmounts().catch((err) => {
            console.error('Background supplier ledger sync failed:', err.message);
          });
        }
      });
    }
  } catch (error) {
    console.error(`MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
