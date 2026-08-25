const Product = require('../models/Product');
const { StockMovement } = require('../models/Warehouse');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Notification = require('../models/Notification');
const { createAuditLog } = require('../middleware/audit');
const { postSaleJournal, postSaleReturnJournal, postPurchaseJournal } = require('./journalService');
const { withOptionalTransaction, sessionQuery, sessionOpts } = require('../utils/mongoTransaction');
const { resolveWarehouseId } = require('../utils/warehouse');
const { applyAllocationsToSale, applyRefundToSale } = require('../utils/saleReturn');

const processSale = async (sale, userId, req) =>
  withOptionalTransaction(async (session) => {
    const warehouseId = await resolveWarehouseId(sale.warehouse);
    sale.warehouse = warehouseId;

    for (const item of sale.items) {
      const product = await sessionQuery(Product.findById(item.product), session);
      if (!product) throw new Error(`Product not found: ${item.productName}`);

      if (product.currentStock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}. Available: ${product.currentStock}`);
      }

      product.currentStock -= item.quantity;
      await product.save(sessionOpts(session));

      await StockMovement.create([{
        product: product._id,
        warehouse: warehouseId,
        type: 'sale',
        quantity: -item.quantity,
        balanceAfter: product.currentStock,
        reference: sale.invoiceNumber,
        referenceId: sale._id,
        createdBy: userId,
      }], sessionOpts(session));

      if (product.currentStock <= product.minStock) {
        await Notification.create([{
          type: product.currentStock === 0 ? 'out_of_stock' : 'low_stock',
          title: product.currentStock === 0 ? 'Out of Stock' : 'Low Stock Alert',
          message: `${product.name} (${product.sku}) - Stock: ${product.currentStock}`,
          link: `/inventory/products/${product._id}`,
          priority: product.currentStock === 0 ? 'critical' : 'high',
        }], sessionOpts(session));
      }
    }

    const customerId = sale.customer?._id || sale.customer;
    if (customerId) {
      const customer = await sessionQuery(Customer.findById(customerId), session);
      if (customer) {
        customer.totalPurchases = (customer.totalPurchases || 0) + sale.total;
        customer.totalPaid = (customer.totalPaid || 0) + (sale.amountPaid || 0);
        customer.outstanding = (customer.outstanding || 0) + (sale.amountDue || 0);
        await customer.save(sessionOpts(session));
      }
    }

    await postSaleJournal(sale, userId, session);
    await createAuditLog(userId, 'create', 'sale', sale._id, null, { invoiceNumber: sale.invoiceNumber, total: sale.total }, req);

    return { success: true };
  });

const processPurchase = async (purchase, userId, req) =>
  withOptionalTransaction(async (session) => {
    const warehouseId = await resolveWarehouseId(purchase.warehouse);
    purchase.warehouse = warehouseId;

    for (const item of purchase.items) {
      const product = await sessionQuery(Product.findById(item.product), session);
      if (!product) throw new Error(`Product not found: ${item.productName}`);

      product.currentStock += item.quantity;
      product.purchasePrice = item.unitPrice;
      product.priceHistory.push({ price: item.unitPrice, type: 'purchase' });
      await product.save(sessionOpts(session));

      await StockMovement.create([{
        product: product._id,
        warehouse: warehouseId,
        type: 'purchase',
        quantity: item.quantity,
        balanceAfter: product.currentStock,
        reference: purchase.invoiceNumber,
        referenceId: purchase._id,
        createdBy: userId,
      }], sessionOpts(session));
    }

    const supplier = await sessionQuery(Supplier.findById(purchase.supplier), session);
    if (supplier) {
      supplier.totalPurchases += purchase.total;
      supplier.totalPaid += purchase.amountPaid;
      supplier.outstanding += purchase.amountDue;
      await supplier.save(sessionOpts(session));
    }

    await postPurchaseJournal(purchase, userId, session);
    await createAuditLog(userId, 'create', 'purchase', purchase._id, null, { invoiceNumber: purchase.invoiceNumber, total: purchase.total }, req);

    return { success: true };
  });

const processSaleReturn = async (saleReturn, originalSale, userId, req, extra = {}) =>
  withOptionalTransaction(async (session) => {
    const parts = extra.parts || [{
      sale: originalSale,
      allocations: extra.allocations || [],
      items: saleReturn.items,
      total: saleReturn.total,
      vatAmount: saleReturn.vatAmount,
      commission: extra.commission || saleReturn.commissionReversed || 0,
    }];

    const warehouseId = await resolveWarehouseId(saleReturn.warehouse || parts[0]?.sale?.warehouse);
    let cashRefund = 0;
    let dueReduce = 0;

    for (const item of saleReturn.items) {
      const product = await sessionQuery(Product.findById(item.product), session);
      if (!product) throw new Error(`Product not found: ${item.productName}`);

      product.currentStock += item.quantity;
      await product.save(sessionOpts(session));

      await StockMovement.create([{
        product: product._id,
        warehouse: warehouseId,
        type: 'sale_return',
        quantity: item.quantity,
        balanceAfter: product.currentStock,
        reference: saleReturn.returnNumber,
        referenceId: saleReturn._id,
        createdBy: userId,
      }], sessionOpts(session));
    }

    for (const part of parts) {
      applyAllocationsToSale(part.sale, part.allocations || [], {
        total: part.total,
        vatAmount: part.vatAmount,
        commission: part.commission || 0,
      });
      const refund = applyRefundToSale(part.sale, part.total, saleReturn.refundMethod);
      cashRefund += refund.cashRefund || 0;
      dueReduce += refund.dueReduce || 0;
      await part.sale.save(sessionOpts(session));
      await createAuditLog(userId, 'return', 'sale', part.sale._id, null, {
        returnNumber: saleReturn.returnNumber,
        total: part.total,
        commissionReversed: part.commission || 0,
      }, req);
    }

    await postSaleReturnJournal(saleReturn, { cashRefund, dueReduce }, userId, session);
    return { success: true, cashRefund, dueReduce };
  });

const processPurchaseReturn = async (purchaseReturn, originalPurchase, userId, req) =>
  withOptionalTransaction(async (session) => {
    const warehouseId = await resolveWarehouseId(purchaseReturn.warehouse || originalPurchase.warehouse);

    for (const item of purchaseReturn.items) {
      const product = await sessionQuery(Product.findById(item.product), session);
      if (!product) throw new Error(`Product not found: ${item.productName}`);

      if (product.currentStock < item.quantity) {
        throw new Error(`Insufficient stock to return ${product.name}. Available: ${product.currentStock}`);
      }

      product.currentStock -= item.quantity;
      await product.save(sessionOpts(session));

      await StockMovement.create([{
        product: product._id,
        warehouse: warehouseId,
        type: 'purchase_return',
        quantity: -item.quantity,
        balanceAfter: product.currentStock,
        reference: purchaseReturn.returnNumber,
        referenceId: purchaseReturn._id,
        createdBy: userId,
      }], sessionOpts(session));
    }

    const supplier = await sessionQuery(Supplier.findById(purchaseReturn.supplier), session);
    if (supplier) {
      supplier.totalPurchases = Math.max(0, supplier.totalPurchases - purchaseReturn.total);
      supplier.outstanding = Math.max(0, supplier.outstanding - purchaseReturn.total);
      await supplier.save(sessionOpts(session));
    }

    originalPurchase.status = 'partial_return';
    await originalPurchase.save(sessionOpts(session));

    await createAuditLog(userId, 'return', 'purchase', originalPurchase._id, null, {
      returnNumber: purchaseReturn.returnNumber,
      total: purchaseReturn.total,
    }, req);

    return { success: true };
  });

module.exports = { processSale, processPurchase, processSaleReturn, processPurchaseReturn };
