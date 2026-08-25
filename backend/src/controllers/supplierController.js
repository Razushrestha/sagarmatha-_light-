const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn');
const SupplierPayment = require('../models/SupplierPayment');
const { Account } = require('../models/Account');
const { processPurchase, processPurchaseReturn } = require('../services/transactionService');
const { postSupplierPaymentJournal } = require('../services/journalService');
const { createAuditLog } = require('../middleware/audit');
const { withOptionalTransaction } = require('../utils/mongoTransaction');

async function syncSupplierLedgerAmounts() {
  const purchases = await Purchase.find({ type: { $ne: "order" } }).select("total").lean();
  if (purchases.length) {
    await Purchase.bulkWrite(
      purchases.map((p) => ({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { debit: 0, credit: p.total || 0 } },
        },
      }))
    );
  }

  const payments = await SupplierPayment.find({}).select("total").lean();
  if (payments.length) {
    await SupplierPayment.bulkWrite(
      payments.map((p) => ({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { debit: p.total || 0, credit: 0 } },
        },
      }))
    );
  }
}

exports.syncSupplierLedgerAmounts = syncSupplierLedgerAmounts;

exports.getSuppliers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [suppliers, total] = await Promise.all([
      Supplier.find(query).sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
      Supplier.countDocuments(query),
    ]);

    res.json({ success: true, data: suppliers, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found.' });
    res.json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.create(req.body);
    res.status(201).json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found.' });
    res.json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPurchases = async (req, res) => {
  try {
    const { page = 1, limit = 20, supplier, type, unpaid } = req.query;
    const query = {};
    if (supplier) query.supplier = supplier;
    if (type) query.type = type;
    else query.type = { $ne: 'order' };
    if (unpaid === 'true') {
      query.amountDue = { $gt: 0 };
      query.status = { $in: ['completed', 'received', 'partial'] };
    }

    const skip = (page - 1) * limit;
    const [purchases, total] = await Promise.all([
      Purchase.find(query).populate('supplier', 'name company').populate('createdBy', 'name').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Purchase.countDocuments(query),
    ]);
    res.json({ success: true, data: purchases, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.purchaseId)
      .populate('supplier', 'name company phone')
      .populate('warehouse', 'name');
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found.' });
    res.json({ success: true, data: purchase });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPurchase = async (req, res) => {
  try {
    const isOrder = req.body.type === 'order';
    const count = await Purchase.countDocuments({ type: isOrder ? 'order' : 'invoice' });
    const prefix = isOrder ? 'POR' : 'PUR';
    const invoiceNumber = `${prefix}-${String(count + 1).padStart(6, '0')}`;

    const total = req.body.total || 0;
    const amountPaid = isOrder ? 0 : (req.body.amountPaid ?? total);
    const amountDue = isOrder ? total : (req.body.amountDue ?? Math.max(0, total - amountPaid));

    const purchaseData = { ...req.body };
    if (!purchaseData.warehouse) {
      const { getDefaultWarehouseId } = require('../utils/warehouse');
      purchaseData.warehouse = await getDefaultWarehouseId();
    }

    const purchase = await Purchase.create({
      ...purchaseData,
      type: isOrder ? 'order' : (req.body.type || 'invoice'),
      status: isOrder ? 'ordered' : (req.body.status || 'completed'),
      invoiceNumber,
      amountPaid,
      amountDue,
      debit: 0,
      credit: isOrder ? 0 : total,
      createdBy: req.user._id,
    });

    if (!isOrder && (purchase.status === 'completed' || purchase.status === 'received')) {
      await processPurchase(purchase, req.user._id, req);
    }

    const populated = await Purchase.findById(purchase._id).populate('supplier', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.receivePurchaseOrder = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.purchaseId);
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    if (purchase.type !== 'order') {
      return res.status(400).json({ success: false, message: 'Only purchase orders can be received.' });
    }
    if (purchase.status === 'completed' || purchase.status === 'received') {
      return res.status(400).json({ success: false, message: 'Purchase order already received.' });
    }

    const payments = req.body.payments || [];
    const amountPaid = payments.reduce((s, p) => s + p.amount, 0) || req.body.amountPaid || 0;
    const amountDue = Math.max(0, purchase.total - amountPaid);

    const count = await Purchase.countDocuments({ type: 'invoice' });
    const invoiceNumber = `PUR-${String(count + 1).padStart(6, '0')}`;

    purchase.type = 'invoice';
    purchase.status = 'completed';
    purchase.invoiceNumber = invoiceNumber;
    purchase.amountPaid = amountPaid;
    purchase.amountDue = amountDue;
    purchase.debit = 0;
    purchase.credit = purchase.total;
    purchase.payments = payments;
    await purchase.save();

    await processPurchase(purchase, req.user._id, req);

    const populated = await Purchase.findById(purchase._id).populate('supplier', 'name');
    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPurchaseReturns = async (req, res) => {
  try {
    const { supplier } = req.query;
    const query = {};
    if (supplier) query.supplier = supplier;

    const returns = await PurchaseReturn.find(query)
      .populate('supplier', 'name')
      .populate('originalPurchase', 'invoiceNumber')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, data: returns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPurchaseReturn = async (req, res) => {
  try {
    const originalPurchase = await Purchase.findById(req.params.purchaseId);
    if (!originalPurchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found.' });
    }

    const items = (req.body.items || []).filter((i) => i.quantity > 0);
    if (!items.length) {
      return res.status(400).json({ success: false, message: 'Select items to return.' });
    }

    for (const item of items) {
      const originalItem = originalPurchase.items.find(
        (i) => i.product.toString() === item.product.toString()
      );
      if (!originalItem) {
        return res.status(400).json({ success: false, message: `Product not in original purchase: ${item.productName}` });
      }
      if (item.quantity > originalItem.quantity) {
        return res.status(400).json({
          success: false,
          message: `Return qty exceeds purchased qty for ${item.productName}`,
        });
      }
    }

    const count = await PurchaseReturn.countDocuments();
    const returnNumber = `PR-${String(count + 1).padStart(6, '0')}`;

    const purchaseReturn = await PurchaseReturn.create({
      ...req.body,
      items,
      returnNumber,
      originalPurchase: originalPurchase._id,
      supplier: originalPurchase.supplier,
      warehouse: req.body.warehouse || originalPurchase.warehouse,
      createdBy: req.user._id,
    });

    await processPurchaseReturn(purchaseReturn, originalPurchase, req.user._id, req);

    const populated = await PurchaseReturn.findById(purchaseReturn._id)
      .populate('supplier', 'name')
      .populate('originalPurchase', 'invoiceNumber');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSupplierPayments = async (req, res) => {
  try {
    const { supplier, limit = 50 } = req.query;
    const query = {};
    if (supplier) query.supplier = supplier;

    const payments = await SupplierPayment.find(query)
      .populate('supplier', 'name outstanding')
      .populate('paidFromAccount', 'name code')
      .populate('createdBy', 'name')
      .populate('purchaseAllocations.purchase', 'invoiceNumber')
      .sort({ voucherDate: -1, createdAt: -1 })
      .limit(Number(limit))
      .lean();

    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSupplierPayment = async (req, res) => {
  try {
    const {
      supplier: supplierId,
      voucherDate,
      paidFromAccount,
      bankName,
      amount,
      discount = 0,
      taxDeducted = 0,
      narration,
      purchaseAllocations = [],
    } = req.body;

    const cashAmount = Number(amount) || 0;
    const discountAmount = Number(discount) || 0;
    const taxAmount = Number(taxDeducted) || 0;
    const payableReduction = cashAmount + discountAmount + taxAmount;

    if (!supplierId || !paidFromAccount) {
      return res.status(400).json({ success: false, message: 'Supplier and paid-from account are required.' });
    }
    if (cashAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found.' });

    const account = await Account.findById(paidFromAccount);
    if (!account) return res.status(404).json({ success: false, message: 'Payment account not found.' });

    if (payableReduction > supplier.outstanding + 0.01) {
      return res.status(400).json({
        success: false,
        message: `Payment exceeds supplier balance. Outstanding: ${supplier.outstanding.toFixed(2)}`,
      });
    }

    const count = await SupplierPayment.countDocuments();
    const paymentNumber = `PV-${String(count + 1).padStart(6, '0')}`;

    let allocations = (purchaseAllocations || []).filter((a) => a.purchase && a.amount > 0);

    if (!allocations.length) {
      const unpaidPurchases = await Purchase.find({
        supplier: supplierId,
        type: { $ne: 'order' },
        amountDue: { $gt: 0 },
      }).sort({ createdAt: 1 });

      let remaining = payableReduction;
      allocations = [];
      for (const purchase of unpaidPurchases) {
        if (remaining <= 0) break;
        const alloc = Math.min(remaining, purchase.amountDue);
        allocations.push({ purchase: purchase._id, amount: alloc });
        remaining -= alloc;
      }
    }

    const payment = await withOptionalTransaction(async (session) => {
      const sessionOpts = session ? { session } : {};
      const find = (Model, id) => {
        const q = Model.findById(id);
        return session ? q.session(session) : q;
      };

      for (const alloc of allocations) {
        const purchase = await find(Purchase, alloc.purchase);
        if (!purchase) continue;
        const applied = Math.min(alloc.amount, purchase.amountDue);
        purchase.amountPaid += applied;
        purchase.amountDue = Math.max(0, purchase.amountDue - applied);
        purchase.payments.push({
          method: account.name.toLowerCase().includes('bank') ? 'bank' : 'cash',
          amount: applied,
          reference: paymentNumber,
          date: voucherDate ? new Date(voucherDate) : new Date(),
        });
        await purchase.save(sessionOpts);
        alloc.amount = applied;
      }

      const supplierDoc = await find(Supplier, supplierId);
      supplierDoc.totalPaid += payableReduction;
      supplierDoc.outstanding = Math.max(0, supplierDoc.outstanding - payableReduction);
      await supplierDoc.save(sessionOpts);

      const paymentDoc = await SupplierPayment.create([{
        paymentNumber,
        supplier: supplierId,
        voucherDate: voucherDate ? new Date(voucherDate) : new Date(),
        paidFromAccount,
        bankName: bankName || "",
        amount: cashAmount,
        discount: discountAmount,
        taxDeducted: taxAmount,
        total: payableReduction,
        debit: payableReduction,
        credit: 0,
        narration,
        purchaseAllocations: allocations,
        createdBy: req.user._id,
      }], sessionOpts);

      await postSupplierPaymentJournal(paymentDoc[0], account, req.user._id, session);
      await createAuditLog(req.user._id, 'payment', 'supplier', supplierId, null, {
        paymentNumber, amount: cashAmount, total: payableReduction,
      }, req);

      return paymentDoc[0];
    });

    const populated = await SupplierPayment.findById(payment._id)
      .populate('supplier', 'name')
      .populate('paidFromAccount', 'name code');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
