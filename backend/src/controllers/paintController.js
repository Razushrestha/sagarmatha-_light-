const PaintShade = require('../models/PaintShade');
const { PACK_LITRES, normalizePack } = require('../config/paintPacks');
const { previewMix, mixAndStock } = require('../services/paintMixService');
const { invalidateShopCache } = require('../utils/cache');

function cleanSwatch(value) {
  const hex = String(value || '').trim();
  return /^#?[0-9a-fA-F]{6}$/.test(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : '#c4a574';
}

function parseFormulas(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const formulas = [];
  for (const row of input) {
    const packLitres = normalizePack(row.packLitres);
    if (!packLitres || seen.has(packLitres)) continue;
    if (!row.baseProduct) continue;
    const colorants = (row.colorants || [])
      .map((line) => ({
        product: line.product,
        millilitres: Number(line.millilitres),
      }))
      .filter((line) => line.product && line.millilitres > 0);
    seen.add(packLitres);
    formulas.push({
      packLitres,
      baseProduct: row.baseProduct,
      sellingPrice: row.sellingPrice === '' || row.sellingPrice == null ? undefined : Number(row.sellingPrice),
      colorants,
    });
  }
  return formulas;
}

exports.listShades = async (req, res) => {
  try {
    const { search, brand } = req.query;
    const query = { isActive: true };
    if (brand) query.brand = brand;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }
    const data = await PaintShade.find(query)
      .populate('brand', 'name')
      .populate('formulas.baseProduct', 'name sku currentStock sellingPrice')
      .populate('formulas.colorants.product', 'name sku currentStock')
      .sort({ code: 1, name: 1 })
      .limit(300)
      .lean();
    res.json({ success: true, data, packs: PACK_LITRES });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createShade = async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    const name = String(req.body.name || '').trim();
    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Shade code and name are required.' });
    }
    const shade = await PaintShade.create({
      brand: req.body.brand || undefined,
      code,
      name,
      swatch: cleanSwatch(req.body.swatch),
      formulas: parseFormulas(req.body.formulas),
    });
    res.status(201).json({ success: true, data: shade });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'That shade code already exists.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateShade = async (req, res) => {
  try {
    const shade = await PaintShade.findById(req.params.id);
    if (!shade) return res.status(404).json({ success: false, message: 'Shade not found.' });
    if (req.body.code) shade.code = String(req.body.code).trim().toUpperCase();
    if (req.body.name) shade.name = String(req.body.name).trim();
    if (req.body.brand !== undefined) shade.brand = req.body.brand || undefined;
    if (req.body.swatch) shade.swatch = cleanSwatch(req.body.swatch);
    if (req.body.formulas) shade.formulas = parseFormulas(req.body.formulas);
    if (typeof req.body.isActive === 'boolean') shade.isActive = req.body.isActive;
    await shade.save();
    res.json({ success: true, data: shade });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeShade = async (req, res) => {
  try {
    const shade = await PaintShade.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!shade) return res.status(404).json({ success: false, message: 'Shade not found.' });
    res.json({ success: true, message: 'Shade archived.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.previewMix = async (req, res) => {
  try {
    const data = await previewMix({
      shadeId: req.body.shadeId || req.query.shadeId,
      packLitres: req.body.packLitres || req.query.packLitres,
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.mix = async (req, res) => {
  try {
    const data = await mixAndStock({
      shadeId: req.body.shadeId,
      packLitres: req.body.packLitres,
      warehouseId: req.body.warehouseId || req.body.warehouse,
      userId: req.user._id,
    });
    await invalidateShopCache(['products', 'dashboard', 'reports']);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

const StockLot = require('../models/StockLot');
const DeliveryChallan = require('../models/DeliveryChallan');
const { scoped, parsePaging } = require('../utils/tenantQuery');
const { changeStock } = require('../utils/stock');
const { resolveWarehouseId } = require('../utils/warehouse');
const Settings = require('../models/Settings');

exports.listLots = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaging(req.query, { defaultLimit: 100, max: 200 });
    const filter = scoped(req, { remaining: { $gt: 0 } });
    if (req.query.product) filter.product = req.query.product;
    const [data, total] = await Promise.all([
      StockLot.find(filter).populate('product', 'name sku').sort({ receivedAt: 1 }).skip(skip).limit(limit).lean(),
      StockLot.countDocuments(filter),
    ]);
    res.json({ success: true, data, pagination: { total, page, pages: Math.ceil(total / limit) || 1, limit } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function nextChallanNumber() {
  const settings = await Settings.findOne();
  const prefix = 'CH';
  const latest = await DeliveryChallan.findOne({ challanNumber: new RegExp(`^${prefix}-`) }).sort({ challanNumber: -1 }).select('challanNumber');
  let next = 1;
  if (latest?.challanNumber) {
    const parsed = parseInt(String(latest.challanNumber).split('-').pop() || '', 10);
    if (!Number.isNaN(parsed)) next = parsed + 1;
  }
  void settings;
  return `${prefix}-${String(next).padStart(6, '0')}`;
}

exports.listChallans = async (req, res) => {
  try {
    const data = await DeliveryChallan.find(scoped(req)).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getChallan = async (req, res) => {
  try {
    const row = await DeliveryChallan.findOne(scoped(req, { _id: req.params.id })).lean();
    if (!row) return res.status(404).json({ success: false, message: 'Challan not found.' });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createChallan = async (req, res) => {
  try {
    const items = (req.body.items || []).filter((row) => row.product && Number(row.quantity) > 0);
    if (!items.length) return res.status(400).json({ success: false, message: 'Add items to the challan.' });
    const challan = await DeliveryChallan.create({
      challanNumber: await nextChallanNumber(),
      customer: req.body.customer,
      customerName: req.body.customerName,
      customerPhone: req.body.customerPhone,
      customerAddress: req.body.customerAddress,
      sale: req.body.sale || undefined,
      items,
      vehicle: req.body.vehicle,
      driver: req.body.driver,
      notes: req.body.notes,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: challan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.dispatchChallan = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findOne(scoped(req, { _id: req.params.id }));
    if (!challan) return res.status(404).json({ success: false, message: 'Challan not found.' });
    if (challan.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only a draft challan can be dispatched.' });
    }
    if (!challan.sale) {
      const warehouseId = await resolveWarehouseId(req.body.warehouse);
      for (const item of challan.items) {
        await changeStock({
          productId: item.product,
          productName: item.productName,
          delta: -Number(item.quantity),
          warehouseId,
          type: 'challan_out',
          reference: challan.challanNumber,
          referenceId: challan._id,
          userId: req.user._id,
        });
      }
    }
    challan.status = 'dispatched';
    challan.dispatchedAt = new Date();
    await challan.save();
    res.json({ success: true, data: challan });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.deliverChallan = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findOne(scoped(req, { _id: req.params.id, status: 'dispatched' }));
    if (!challan) return res.status(404).json({ success: false, message: 'Dispatched challan not found.' });
    challan.status = 'delivered';
    challan.deliveredAt = new Date();
    await challan.save();
    res.json({ success: true, data: challan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
