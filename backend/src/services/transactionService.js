const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const Supplier = require('../models/Supplier');
const PurchaseReturn = require('../models/PurchaseReturn');
const Notification = require('../models/Notification');
const { createAuditLog } = require('../middleware/audit');
const { postSaleJournal, postSaleReturnJournal, postPurchaseJournal } = require('./journalService');
const { withOptionalTransaction, sessionQuery, sessionOpts } = require('../utils/mongoTransaction');
const { changeStock } = require('../utils/stock');
const { resolveWarehouseId } = require('../utils/warehouse');
const CustomerPayment = require('../models/CustomerPayment');
const { applyAllocationsToSale, applyRefundToSale } = require('../utils/saleReturn');
const { recordStoreCredit, reconcileCustomerOutstanding } = require('../utils/salePayments');

async function applyItemStock(item, { sign, session, warehouseId, type, reference, referenceId, userId }) {
  const lines = Array.isArray(item.recipeDeducted) && item.recipeDeducted.length ? item.recipeDeducted : null;
  if (!lines && !item.product) return null;
  if (lines) {
    let last = null;
    for (const line of lines) {
      const qty = Number(line.qty) * Number(item.quantity);
      if (!(qty > 0)) continue;
      last = await changeStock({
        productId: line.product,
        productName: line.productName,
        delta: sign * qty,
        session,
        warehouseId,
        type,
        reference,
        referenceId,
        userId,
      });
    }
    return last;
  }
  return changeStock({
    productId: item.product,
    productName: item.productName,
    delta: sign * Number(item.quantity),
    session,
    warehouseId,
    type,
    reference,
    referenceId,
    userId,
  });
}

const processSale = async (sale, userId, req) =>
  withOptionalTransaction(async (session) => {
    const warehouseId = await resolveWarehouseId(sale.warehouse);
    sale.warehouse = warehouseId;

    for (const item of sale.items) {
      const product = await applyItemStock(item, {
        sign: -1,
        session,
        warehouseId,
        type: 'sale',
        reference: sale.invoiceNumber,
        referenceId: sale._id,
        userId,
      });

      if (product && product.currentStock <= product.minStock) {
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
      await changeStock({
        productId: item.product,
        productName: item.productName,
        delta: item.quantity,
        session,
        warehouseId,
        type: 'purchase',
        reference: purchase.invoiceNumber,
        referenceId: purchase._id,
        userId,
        extraUpdate: {
          $set: { purchasePrice: item.unitPrice },
          $push: { priceHistory: { price: item.unitPrice, type: 'purchase', date: new Date() } },
        },
        lotCost: item.unitPrice,
        batchNo: item.batchNo || purchase.invoiceNumber,
        expiry: item.expiry,
      });
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

const reversePurchase = async (purchase, userId, req) =>
  withOptionalTransaction(async (session) => {
    const warehouseId = await resolveWarehouseId(purchase.warehouse);

    for (const item of purchase.items) {
      try {
        await changeStock({
          productId: item.product,
          productName: item.productName,
          delta: -item.quantity,
          session,
          warehouseId,
          type: 'adjustment_minus',
          reference: `${purchase.invoiceNumber}-REV`,
          referenceId: purchase._id,
          userId,
        });
      } catch (error) {
        if (String(error.message).startsWith('Insufficient stock')) {
          throw new Error(
            `Cannot reverse ${purchase.invoiceNumber}. ${item.productName} does not have enough stock to undo this purchase.`
          );
        }
        throw error;
      }
    }

    const supplier = await sessionQuery(Supplier.findById(purchase.supplier), session);
    if (supplier) {
      supplier.totalPurchases = Math.max(0, (supplier.totalPurchases || 0) - (purchase.total || 0));
      supplier.totalPaid = Math.max(0, (supplier.totalPaid || 0) - (purchase.amountPaid || 0));
      supplier.outstanding = Math.max(0, (supplier.outstanding || 0) - (purchase.amountDue || 0));
      await supplier.save(sessionOpts(session));
    }

    await createAuditLog(userId, 'update', 'purchase', purchase._id, null, {
      invoiceNumber: purchase.invoiceNumber,
      reversed: true,
    }, req);

    return { success: true };
  });

const reverseSale = async (sale, userId, req) =>
  withOptionalTransaction(async (session) => {
    const warehouseId = await resolveWarehouseId(sale.warehouse);

    for (const item of sale.items) {
      await applyItemStock(item, {
        sign: 1,
        session,
        warehouseId,
        type: 'sale_return',
        reference: `${sale.invoiceNumber}-REV`,
        referenceId: sale._id,
        userId,
      });
    }

    const customerId = sale.customer?._id || sale.customer;
    if (customerId) {
      const customer = await sessionQuery(Customer.findById(customerId), session);
      if (customer) {
        customer.totalPurchases = Math.max(0, (customer.totalPurchases || 0) - (sale.total || 0));
        customer.totalPaid = Math.max(0, (customer.totalPaid || 0) - (sale.amountPaid || 0));
        customer.outstanding = Math.max(0, (customer.outstanding || 0) - (sale.amountDue || 0));
        await customer.save(sessionOpts(session));
      }
    }

    await createAuditLog(userId, 'update', 'sale', sale._id, null, {
      invoiceNumber: sale.invoiceNumber,
      reversed: true,
    }, req);

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
    let storeCredit = 0;

    for (const item of saleReturn.items) {
      const original = (originalSale?.items || []).find((row) => String(row.product) === String(item.product));
      await applyItemStock({
        ...item,
        recipeDeducted: item.recipeDeducted?.length ? item.recipeDeducted : original?.recipeDeducted,
      }, {
        sign: 1,
        session,
        warehouseId,
        type: 'sale_return',
        reference: saleReturn.returnNumber,
        referenceId: saleReturn._id,
        userId,
      });
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
      storeCredit += refund.storeCredit || 0;
      await part.sale.save(sessionOpts(session));
      await createAuditLog(userId, 'return', 'sale', part.sale._id, null, {
        returnNumber: saleReturn.returnNumber,
        total: part.total,
        commissionReversed: part.commission || 0,
      }, req);
    }

    if (storeCredit > 0 && saleReturn.customer) {
      await recordStoreCredit(CustomerPayment, {
        customerId: saleReturn.customer,
        saleId: originalSale?._id || saleReturn.originalSale,
        amount: storeCredit,
        returnNumber: saleReturn.returnNumber,
        userId,
        session,
      });
      await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, saleReturn.customer);
    }

    await postSaleReturnJournal(saleReturn, { cashRefund, dueReduce, storeCredit }, userId, session);
    return { success: true, cashRefund, dueReduce, storeCredit };
  });

const processPurchaseReturn = async (purchaseReturn, originalPurchase, userId, req) =>
  withOptionalTransaction(async (session) => {
    const warehouseId = await resolveWarehouseId(purchaseReturn.warehouse || originalPurchase.warehouse);

    for (const item of purchaseReturn.items) {
      await changeStock({
        productId: item.product,
        productName: item.productName,
        delta: -item.quantity,
        session,
        warehouseId,
        type: 'purchase_return',
        reference: purchaseReturn.returnNumber,
        referenceId: purchaseReturn._id,
        userId,
      });
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

const reversePurchaseReturn = async (purchaseReturn, originalPurchase, userId, req) =>
  withOptionalTransaction(async (session) => {
    const warehouseId = await resolveWarehouseId(purchaseReturn.warehouse || originalPurchase.warehouse);

    for (const item of purchaseReturn.items) {
      await changeStock({
        productId: item.product,
        productName: item.productName,
        delta: item.quantity,
        session,
        warehouseId,
        type: 'adjustment_plus',
        reference: `${purchaseReturn.returnNumber}-REV`,
        referenceId: purchaseReturn._id,
        userId,
      });
    }

    const supplier = await sessionQuery(Supplier.findById(purchaseReturn.supplier), session);
    if (supplier) {
      supplier.totalPurchases = (supplier.totalPurchases || 0) + (purchaseReturn.total || 0);
      supplier.outstanding = (supplier.outstanding || 0) + (purchaseReturn.total || 0);
      await supplier.save(sessionOpts(session));
    }

    const leftoverQuery = PurchaseReturn.countDocuments({
      originalPurchase: originalPurchase._id,
      _id: { $ne: purchaseReturn._id },
    });
    const leftover = session ? await leftoverQuery.session(session) : await leftoverQuery;

    originalPurchase.status = leftover > 0 ? 'returned' : 'completed';
    await originalPurchase.save(sessionOpts(session));

    await createAuditLog(userId, 'update', 'purchase', originalPurchase._id, null, {
      returnNumber: purchaseReturn.returnNumber,
      reversed: true,
    }, req);

    return { success: true };
  });

module.exports = { processSale, processPurchase, reversePurchase, reverseSale, processSaleReturn, processPurchaseReturn, reversePurchaseReturn };
