const authRoutes = require('./auth');
const productRoutes = require('./products');
const saleRoutes = require('./sales');
const customerRoutes = require('./customers');
const supplierRoutes = require('./suppliers');
const miscRoutes = require('./misc');
const accountingRoutes = require('./accounting');
const inventoryRoutes = require('./inventory');
const electricianRoutes = require('./electricians');

function mountApi(app) {
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/sales', saleRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/accounting', accountingRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/electricians', electricianRoutes);
  app.use('/api', miscRoutes);
}

module.exports = { mountApi };
