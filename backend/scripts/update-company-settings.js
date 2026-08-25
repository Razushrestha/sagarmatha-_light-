require('dotenv').config();
const mongoose = require('mongoose');
const Settings = require('../src/models/Settings');
const company = require('../src/config/company');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const count = await Settings.countDocuments();
  if (count === 0) {
    await Settings.create({
      companyName: company.companyName,
      address: company.address,
      vatNumber: company.vatNumber,
      phone: company.phone,
      email: company.email,
      vatRate: 13,
    });
    console.log('Created settings document');
  } else {
    const result = await Settings.updateMany({}, {
      $set: {
        companyName: company.companyName,
        address: company.address,
        vatNumber: company.vatNumber,
      },
    });
    console.log(`Updated ${result.modifiedCount} settings document(s)`);
  }
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
