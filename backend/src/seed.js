require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');
const Category = require('./models/Category');
const Brand = require('./models/Brand');
const { Unit } = require('./models/Unit');
const { Warehouse } = require('./models/Warehouse');
const Product = require('./models/Product');
const Customer = require('./models/Customer');
const Supplier = require('./models/Supplier');
const Settings = require('./models/Settings');
const company = require('./config/company');
const { Account } = require('./models/Account');

const seed = async () => {
  await connectDB();

  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany(), Category.deleteMany(), Brand.deleteMany(),
    Unit.deleteMany(), Warehouse.deleteMany(), Product.deleteMany(),
    Customer.deleteMany(), Supplier.deleteMany(), Settings.deleteMany(),
    Account.deleteMany(),
  ]);

  console.log('Creating admin user...');
  await User.create({
    name: 'Super Admin',
    email: 'admin@nepatronix.com',
    password: 'admin123',
    phone: '9800000000',
    role: 'super_admin',
  });

  await User.create({
    name: 'Sales Staff',
    email: 'sales@nepatronix.com',
    password: 'sales123',
    phone: '9800000001',
    role: 'sales_staff',
  });

  console.log('Creating categories & brands...');
  const categories = await Category.insertMany([
    { name: 'Wires & Cables' },
    { name: 'Switches & Sockets' },
    { name: 'Lighting' },
    { name: 'Tools & Hardware' },
    { name: 'UPS & Inverters' },
    { name: 'CCTV & Security' },
    { name: 'Motors & Pumps' },
    { name: 'Conduits & Fittings' },
  ]);

  const brands = await Brand.insertMany([
    { name: 'Anchor' }, { name: 'Havells' }, { name: 'Philips' },
    { name: 'Syska' }, { name: 'Finolex' }, { name: 'Polycab' },
    { name: 'Legrand' }, { name: 'Schneider' },
  ]);

  const units = await Unit.insertMany([
    { name: 'Piece', shortName: 'Pcs' },
    { name: 'Meter', shortName: 'M' },
    { name: 'Feet', shortName: 'Ft' },
    { name: 'Box', shortName: 'Box' },
    { name: 'Roll', shortName: 'Roll' },
    { name: 'Kilogram', shortName: 'Kg' },
    { name: 'Set', shortName: 'Set' },
    { name: 'Pair', shortName: 'Pair' },
  ]);

  const warehouse = await Warehouse.create({
    name: 'Main Warehouse',
    code: 'WH-001',
    address: 'Kupondole, Lalitpur',
    isDefault: true,
  });

  const supplier = await Supplier.create({
    name: 'Himalayan Electrical Suppliers',
    company: 'HES Pvt. Ltd.',
    phone: '9811111111',
    address: 'Teku, Kathmandu',
    pan: '123456789',
    paymentTerms: 'net30',
  });

  console.log('Creating sample products...');
  const products = [
    { name: '2.5mm Copper Wire (Per Meter)', sku: 'WR-250-CU', barcode: '8901001001001', category: categories[0]._id, brand: brands[4]._id, purchasePrice: 45, sellingPrice: 65, wholesalePrice: 58, currentStock: 500, minStock: 50, unit: units[1]._id },
    { name: '6A Switch (Anchor)', sku: 'SW-6A-ANC', barcode: '8901001001002', category: categories[1]._id, brand: brands[0]._id, purchasePrice: 35, sellingPrice: 55, wholesalePrice: 48, currentStock: 200, minStock: 30, unit: units[0]._id },
    { name: 'LED Bulb 9W (Philips)', sku: 'LED-9W-PH', barcode: '8901001001003', category: categories[2]._id, brand: brands[2]._id, purchasePrice: 120, sellingPrice: 180, wholesalePrice: 160, currentStock: 150, minStock: 20, unit: units[0]._id },
    { name: 'MCB 32A Single Pole', sku: 'MCB-32A-SP', barcode: '8901001001004', category: categories[1]._id, brand: brands[7]._id, purchasePrice: 280, sellingPrice: 420, wholesalePrice: 380, currentStock: 80, minStock: 15, unit: units[0]._id },
    { name: 'UPS 1KVA (Syska)', sku: 'UPS-1KVA-SK', barcode: '8901001001005', category: categories[4]._id, brand: brands[3]._id, purchasePrice: 8500, sellingPrice: 12000, wholesalePrice: 11000, currentStock: 25, minStock: 5, unit: units[0]._id, warrantyMonths: 12 },
    { name: 'CCTV Camera 2MP', sku: 'CCTV-2MP', barcode: '8901001001006', category: categories[5]._id, brand: brands[2]._id, purchasePrice: 2200, sellingPrice: 3500, wholesalePrice: 3200, currentStock: 40, minStock: 10, unit: units[0]._id, warrantyMonths: 6 },
    { name: 'PVC Conduit Pipe 20mm', sku: 'PVC-20MM', barcode: '8901001001007', category: categories[7]._id, brand: brands[4]._id, purchasePrice: 25, sellingPrice: 40, wholesalePrice: 35, currentStock: 300, minStock: 40, unit: units[1]._id },
    { name: 'Hammer Drill 13mm', sku: 'HD-13MM', barcode: '8901001001008', category: categories[3]._id, brand: brands[1]._id, purchasePrice: 4500, sellingPrice: 6500, wholesalePrice: 5800, currentStock: 15, minStock: 3, unit: units[0]._id, warrantyMonths: 12 },
    { name: 'Ceiling Fan 48 inch', sku: 'CF-48-HV', barcode: '8901001001009', category: categories[2]._id, brand: brands[1]._id, purchasePrice: 2800, sellingPrice: 4200, wholesalePrice: 3800, currentStock: 30, minStock: 5, unit: units[0]._id, warrantyMonths: 24 },
    { name: 'Water Pump 1HP', sku: 'WP-1HP', barcode: '8901001001010', category: categories[6]._id, brand: brands[0]._id, purchasePrice: 6500, sellingPrice: 9500, wholesalePrice: 8500, currentStock: 12, minStock: 3, unit: units[0]._id, warrantyMonths: 12 },
  ].map(p => ({ ...p, warehouse: warehouse._id, supplier: supplier._id }));

  await Product.insertMany(products);

  await Customer.insertMany([
    { name: 'Ram Bahadur Thapa', phone: '9841000001', address: 'Patan, Lalitpur', customerType: 'retail' },
    { name: 'Sita Construction Pvt. Ltd.', company: 'Sita Construction', phone: '9841000002', address: 'Baneshwor, Kathmandu', pan: '601234567', customerType: 'project', creditLimit: 500000 },
    { name: 'Krishna Electrical Shop', company: 'Krishna Electrical', phone: '9841000003', address: 'Bhaktapur', customerType: 'dealer', creditLimit: 200000 },
    { name: 'Gita Hardware Store', phone: '9841000004', address: 'Kirtipur', customerType: 'wholesale', creditLimit: 100000 },
  ]);

  await Settings.create({
    companyName: company.companyName,
    address: company.address,
    phone: company.phone,
    email: company.email,
    vatNumber: company.vatNumber,
    vatRate: 13,
    paymentMethods: [
      { name: 'Cash', enabled: true },
      { name: 'Bank Transfer', enabled: true },
      { name: 'eSewa', enabled: true },
      { name: 'Khalti', enabled: true },
      { name: 'Fonepay', enabled: true },
      { name: 'Credit', enabled: true },
    ],
  });

  await Account.insertMany([
    { code: '1001', name: 'Cash', type: 'asset', isSystem: true },
    { code: '1002', name: 'Bank', type: 'asset', isSystem: true },
    { code: '1101', name: 'Accounts Receivable', type: 'asset', isSystem: true },
    { code: '1201', name: 'Inventory', type: 'asset', isSystem: true },
    { code: '2001', name: 'Accounts Payable', type: 'liability', isSystem: true },
    { code: '2101', name: 'VAT Payable', type: 'tax', isSystem: true },
    { code: '2102', name: 'VAT Input', type: 'tax', isSystem: true },
    { code: '3001', name: 'Owner Capital', type: 'equity', isSystem: true },
    { code: '4001', name: 'Sales Revenue', type: 'income', isSystem: true },
    { code: '5001', name: 'Cost of Goods Sold', type: 'cogs', isSystem: true },
    { code: '6001', name: 'Rent Expense', type: 'expense', isSystem: true },
    { code: '6002', name: 'Salary Expense', type: 'expense', isSystem: true },
  ]);

  console.log('\n✅ Database seeded successfully!');
  console.log('\nLogin credentials:');
  console.log('  Admin: admin@nepatronix.com / admin123');
  console.log('  Sales: sales@nepatronix.com / sales123');

  process.exit(0);
};

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
