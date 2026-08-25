require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../src/models/Customer');
const Sale = require('../src/models/Sale');
const CustomerPayment = require('../src/models/CustomerPayment');
const { reconcileAllDebtors } = require('../src/utils/salePayments');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  await reconcileAllDebtors(Customer, Sale, CustomerPayment);

  const debtors = await Customer.find({ isActive: true, outstanding: { $gt: 0 } })
    .select('name outstanding creditBalance totalPurchases totalPaid');
  const creditCustomers = await Customer.find({ isActive: true, creditBalance: { $gt: 0 } })
    .select('name outstanding creditBalance totalPurchases totalPaid');
  console.log('Debtors:', JSON.stringify(debtors, null, 2));
  console.log('Credit:', JSON.stringify(creditCustomers, null, 2));

  for (const name of ['Razu', 'Raj']) {
    const c = await Customer.findOne({ name: new RegExp(name, 'i') });
    if (!c) continue;
    const sales = await Sale.find({ customer: c._id, type: 'invoice' })
      .select('invoiceNumber total amountPaid amountDue payments status');
    console.log(`\n${c.name} outstanding=${c.outstanding} purchases=${c.totalPurchases}`);
    console.log('Sales:', JSON.stringify(sales, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
