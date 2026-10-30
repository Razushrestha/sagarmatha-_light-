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
const { scoped } = require('../utils/tenantQuery');
const { matchingHappyHour } = require('../utils/happyHour');

exports.listTables = async (req, res) => {
  try {
    const data = await DiningTable.find(scoped(req, { isActive: true })).sort({ name: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
