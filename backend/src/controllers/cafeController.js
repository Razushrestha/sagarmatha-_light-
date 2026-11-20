const Product = require('../models/Product');
const { changeStock } = require('../utils/stock');
const { withOptionalTransaction } = require('../utils/mongoTransaction');
const { resolveWarehouseId } = require('../utils/warehouse');
const { invalidateShopCache } = require('../utils/cache');
const { createAuditLog } = require('../middleware/audit');
const {
  resolveRecipe,
  cleanRecipe,
  cleanGroups,
  cleanModifiers,
  catalogMargins,
  stampRecipeItems,
} = require('../services/recipeService');

exports.listMenu = async (req, res) => {
  try {
    const data = await Product.find({
      isActive: true,
      'attrs.role': { $nin: ['ingredient', 'colorant'] },
    })
      .select('name sku sellingPrice currentStock attrs category images')
      .populate('category', 'name')
      .sort({ name: 1 })
      .limit(200)
      .lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRecipe = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    const recipe = cleanRecipe(req.body.recipe);
    const modifierGroups = cleanGroups(req.body.modifierGroups);
    product.attrs = {
      ...(product.attrs || {}),
      role: recipe.length ? 'menu' : (product.attrs?.role || 'stock'),
      recipe,
      modifierGroups,
    };
    await product.save();
    await invalidateShopCache(['products']);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.recipeMargins = async (req, res) => {
  try {
    const data = await catalogMargins();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bookWaste = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'Waste needs a reason.' });
    const quantity = Number(req.body.quantity) || 1;
    if (quantity <= 0) return res.status(400).json({ success: false, message: 'Quantity must be more than 0.' });

    const product = await Product.findById(req.body.productId).lean();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    const modifiers = cleanModifiers(req.body.modifiers);
    let lines = resolveRecipe(product, modifiers);
    if (!lines.length) {
      lines = [{ product: String(product._id), productName: product.name, qty: 1 }];
    }

    const names = await Product.find({ _id: { $in: lines.map((line) => line.product) } }).select('name').lean();
    const nameMap = new Map(names.map((row) => [String(row._id), row.name]));

    const warehouseId = await resolveWarehouseId(req.body.warehouseId || req.body.warehouse);
    const ref = `WASTE-${Date.now()}`;

    await withOptionalTransaction(async (session) => {
      for (const line of lines) {
        await changeStock({
          productId: line.product,
          productName: nameMap.get(String(line.product)) || line.productName,
          delta: -(line.qty * quantity),
          session,
          warehouseId,
          type: 'waste',
          reference: ref,
          userId: req.user._id,
          notes: `${reason} · ${product.name}`,
        });
      }
      await createAuditLog(req.user._id, 'stock_adjust', 'product', product._id, null, {
        waste: true,
        reason,
        quantity,
        ref,
      }, req);
    });

    await invalidateShopCache(['products', 'dashboard', 'reports']);
    res.status(201).json({ success: true, data: { reference: ref, reason, lines, quantity } });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

const DiningTable = require('../models/DiningTable');
const PriceRule = require('../models/PriceRule');
const Sale = require('../models/Sale');
const Settings = require('../models/Settings');
const { scoped } = require('../utils/tenantQuery');
const { matchingHappyHour, applyHappyHourToItems } = require('../utils/happyHour');
const { getDefaultWarehouseId } = require('../utils/warehouse');
const { cafeBillTotals } = require('../utils/cafeBill');
const { nextInvoiceNumber } = require('../utils/invoiceNumber');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function stampTintedItems(items) {
  if (!Array.isArray(items) || !items.length) return items;
  const ids = items.map((item) => item.product).filter(Boolean);
  const products = await Product.find({ _id: { $in: ids } }).select('attrs').lean();
  const byId = new Map(products.map((row) => [String(row._id), row]));
  return items.map((item) => {
    const product = byId.get(String(item.product));
    const mark = Boolean(product?.attrs?.tinted);
    return {
      ...item,
      tinted: mark,
      shadeCode: mark ? (product.attrs.shadeCode || item.shadeCode) : item.shadeCode,
    };
  });
}

async function applyCafeTotalsToBody(req, body) {
  const settings = await Settings.findOne().select('serviceChargePercent vatRate vatEnabled').lean();
  const scPercent = Number(settings?.serviceChargePercent);
  const vatOn = settings?.vatEnabled !== false;
  const vatRate = vatOn ? Number(settings?.vatRate) : 0;
  const serviceType = body.serviceType === 'takeaway' ? 'takeaway' : 'dine_in';
  body.serviceType = serviceType;
  const bill = cafeBillTotals({
    food: Number(body.subtotal) || 0,
    serviceChargePercent: Number.isFinite(scPercent) ? scPercent : 10,
    vatRate: Number.isFinite(vatRate) ? vatRate : 13,
    includeVat: vatOn && body.isVatBill !== false,
    serviceType,
  });
  if (!vatOn) {
    body.isVatBill = false;
    body.type = body.type === 'quotation' ? body.type : 'estimate';
  }
  body.serviceChargePercent = serviceType === 'takeaway' ? 0 : (Number.isFinite(scPercent) ? scPercent : 10);
  body.serviceChargeAmount = bill.serviceCharge;
  body.vatAmount = bill.vatAmount;
  body.total = bill.total;
}

function normalizeBillItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((item) => {
      const quantity = Math.max(0.01, Number(item.quantity) || 0);
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      const discount = Math.max(0, Number(item.discount) || 0);
      const discountType = item.discountType === 'fixed' ? 'fixed' : 'percent';
      const gross = quantity * unitPrice;
      const discountAmt = discountType === 'fixed' ? discount : (gross * discount) / 100;
      const subtotal = round2(Math.max(0, gross - discountAmt));
      const name = String(item.productName || item.name || '').trim();
      if (!name || !(quantity > 0)) return null;
      return {
        product: item.product || undefined,
        productName: name,
        sku: item.sku || '',
        quantity,
        unitPrice,
        discount,
        discountType,
        vatRate: Number(item.vatRate) || 13,
        vatAmount: round2(Number(item.vatAmount) || 0),
        subtotal,
        costPrice: Number(item.costPrice) || round2(unitPrice * 0.7),
        categoryName: item.categoryName || '',
        modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
        complimentary: Boolean(item.complimentary),
        compReason: item.compReason || '',
      };
    })
    .filter(Boolean);
}

async function syncTableFromSale(table, sale) {
  if (sale && sale.isHeld) {
    table.status = 'occupied';
    table.sale = sale._id;
  } else {
    table.status = 'free';
    table.sale = null;
  }
  await table.save();
}

exports.listTables = async (req, res) => {
  try {
    const tables = await DiningTable.find(scoped(req, { isActive: true })).sort({ name: 1 }).lean();
    const tableIds = tables.map((row) => row._id);
    const held = tableIds.length
      ? await Sale.find(scoped(req, { isHeld: true, table: { $in: tableIds } }))
        .select('table items subtotal total vatAmount serviceChargeAmount serviceChargePercent invoiceNumber customerName heldAt isVatBill')
        .lean()
      : [];
    const byTable = new Map(held.map((sale) => [String(sale.table), sale]));
    const data = tables.map((table) => {
      const openBill = byTable.get(String(table._id)) || null;
      return {
        ...table,
        status: openBill ? 'occupied' : (table.status || 'free'),
        openBill,
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTableBill = async (req, res) => {
  try {
    const table = await DiningTable.findOne(scoped(req, { _id: req.params.id, isActive: true })).lean();
    if (!table) return res.status(404).json({ success: false, message: 'Table not found.' });
    const sale = await Sale.findOne(scoped(req, { table: table._id, isHeld: true }))
      .populate('customer', 'name phone')
      .lean();
    res.json({ success: true, data: { table, sale } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveTableBill = async (req, res) => {
  try {
    const table = await DiningTable.findOne(scoped(req, { _id: req.params.id, isActive: true }));
    if (!table) return res.status(404).json({ success: false, message: 'Table not found.' });

    let items = normalizeBillItems(req.body.items);
    let sale = await Sale.findOne(scoped(req, { table: table._id, isHeld: true }));

    if (!items.length) {
      if (sale) {
        await Sale.deleteOne({ _id: sale._id });
        sale = null;
      }
      await syncTableFromSale(table, null);
      return res.json({ success: true, data: { table, sale: null } });
    }

    const warehouse = req.body.warehouse || (sale && sale.warehouse) || await getDefaultWarehouseId();
    items = await stampTintedItems(items);
    items = await stampRecipeItems(items);
    const draft = {
      items,
      subtotal: round2(items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0)),
      isVatBill: req.body.isVatBill !== false,
      serviceType: req.body.serviceType === 'takeaway' ? 'takeaway' : 'dine_in',
    };
    const rules = await PriceRule.find({ isActive: true }).lean();
    const rule = matchingHappyHour(rules);
    if (rule) {
      draft.items = applyHappyHourToItems(draft.items, rule);
      draft.subtotal = round2(draft.items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0));
      draft.happyHourPercent = rule.percentOff;
    }
    await applyCafeTotalsToBody(req, draft);

    if (!sale) {
      sale = await Sale.create({
        type: 'invoice',
        status: 'draft',
        isHeld: true,
        heldAt: new Date(),
        invoiceNumber: await nextInvoiceNumber('INV'),
        items: draft.items,
        subtotal: draft.subtotal,
        vatAmount: draft.vatAmount,
        serviceChargeAmount: draft.serviceChargeAmount,
        serviceChargePercent: draft.serviceChargePercent,
        serviceType: draft.serviceType,
        total: draft.total,
        amountPaid: 0,
        amountDue: draft.total,
        payments: [],
        isVatBill: draft.isVatBill,
        warehouse,
        table: table._id,
        happyHourPercent: draft.happyHourPercent,
        createdBy: req.user._id,
      });
    } else {
      sale.items = draft.items;
      sale.subtotal = draft.subtotal;
      sale.vatAmount = draft.vatAmount;
      sale.serviceChargeAmount = draft.serviceChargeAmount;
      sale.serviceChargePercent = draft.serviceChargePercent;
      sale.serviceType = draft.serviceType;
      sale.total = draft.total;
      sale.amountPaid = 0;
      sale.amountDue = draft.total;
      sale.isVatBill = draft.isVatBill;
      sale.warehouse = warehouse;
      sale.happyHourPercent = draft.happyHourPercent;
      sale.heldAt = new Date();
      await sale.save();
    }

    await syncTableFromSale(table, sale);
    const populated = await Sale.findById(sale._id).populate('customer', 'name phone').lean();
    await invalidateShopCache(['dashboard', 'reports']);
    res.json({ success: true, data: { table, sale: populated } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.createTable = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Table name is required.' });
    const table = await DiningTable.create({ name, seats: Number(req.body.seats) || 4 });
    res.status(201).json({ success: true, data: table });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'That table already exists.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTable = async (req, res) => {
  try {
    const table = await DiningTable.findOneAndUpdate(
      scoped(req, { _id: req.params.id }),
      { name: req.body.name, seats: req.body.seats, isActive: req.body.isActive },
      { new: true }
    );
    if (!table) return res.status(404).json({ success: false, message: 'Table not found.' });
    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listPriceRules = async (req, res) => {
  try {
    const data = await PriceRule.find(scoped(req)).sort({ createdAt: -1 }).lean();
    const active = matchingHappyHour(data.filter((row) => row.isActive));
    res.json({ success: true, data, active });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePriceRule = async (req, res) => {
  try {
    const payload = {
      name: String(req.body.name || 'Happy hour').trim(),
      percentOff: Number(req.body.percentOff) || 0,
      days: Array.isArray(req.body.days) ? req.body.days.map(Number) : [0, 1, 2, 3, 4, 5, 6],
      startTime: req.body.startTime || '17:00',
      endTime: req.body.endTime || '19:00',
      productIds: req.body.productIds || [],
      isActive: req.body.isActive !== false,
    };
    let row;
    if (req.params.id) {
      row = await PriceRule.findOneAndUpdate(scoped(req, { _id: req.params.id }), payload, { new: true });
      if (!row) return res.status(404).json({ success: false, message: 'Rule not found.' });
    } else {
      row = await PriceRule.create(payload);
    }
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.removePriceRule = async (req, res) => {
  try {
    const row = await PriceRule.findOneAndDelete(scoped(req, { _id: req.params.id }));
    if (!row) return res.status(404).json({ success: false, message: 'Rule not found.' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
