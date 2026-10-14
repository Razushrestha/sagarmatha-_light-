require('dotenv').config();
const connectDB = require('../src/config/db');
const Customer = require('../src/models/Customer');
const CustomerPayment = require('../src/models/CustomerPayment');
const Sale = require('../src/models/Sale');
const SaleReturn = require('../src/models/SaleReturn');
const { ensureSaleReturnStoreCredits, reconcileCustomerOutstanding } = require('../src/utils/salePayments');

(async () => {
  await connectDB();
  await ensureSaleReturnStoreCredits(CustomerPayment, SaleReturn, Sale);
  const ids = await SaleReturn.distinct('customer', {
    refundMethod: 'credit_note',
    customer: { $ne: null },
  });
  for (const id of ids) {
    await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, id);
  }
  const credits = await Customer.find({ creditBalance: { $gt: 0 } }).select('name creditBalance');
  console.log('Customers with store credit:', credits.map((c) => ({ name: c.name, credit: c.creditBalance })));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
