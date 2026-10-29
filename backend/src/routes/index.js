const authRoutes = require('./auth');
const publicRoutes = require('./public');
const platformRoutes = require('./platform');
const productRoutes = require('./products');
const saleRoutes = require('./sales');
const customerRoutes = require('./customers');
const supplierRoutes = require('./suppliers');
const miscRoutes = require('./misc');
const accountingRoutes = require('./accounting');
const inventoryRoutes = require('./inventory');
const electricianRoutes = require('./electricians');
const paintRoutes = require('./paint');
const cafeRoutes = require('./cafe');
const shiftRoutes = require('./shifts');
const hotelRoutes = require('./hotel');

function mountApi(app) {
  app.use('/api/public', publicRoutes);
  app.use('/api/platform', platformRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/sales', saleRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/accounting', accountingRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/electricians', electricianRoutes);
  app.use('/api/paint', paintRoutes);
  app.use('/api/cafe', cafeRoutes);
  app.use('/api/shifts', shiftRoutes);
  app.use('/api/hotel', hotelRoutes);
  app.use('/api', miscRoutes);
}

module.exports = { mountApi };
