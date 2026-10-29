const Product = require('../models/Product');
const PaintShade = require('../models/PaintShade');
const { changeStock } = require('../utils/stock');
const { withOptionalTransaction, sessionQuery } = require('../utils/mongoTransaction');
const { resolveWarehouseId } = require('../utils/warehouse');
const { normalizePack } = require('../config/paintPacks');
const { postCharge } = require('./journalService');

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function formulaFor(shade, packLitres) {
  return (shade.formulas || []).find((row) => Number(row.packLitres) === packLitres);
}

function tintedSku(baseSku, shadeCode, packLitres) {
  const base = String(baseSku || 'BASE').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10);
  const code = String(shadeCode || 'SHADE').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10);
  return `T-${base}-${code}-${packLitres}L`.slice(0, 30);
}

async function populateShade(id, session) {
  const shade = await sessionQuery(
    PaintShade.findById(id)
      .populate('brand', 'name')
      .populate('formulas.baseProduct', 'name sku sellingPrice currentStock minStock warehouse category brand unit attrs vatInclusive vatRate commissionPercent images purchasePrice')
      .populate('formulas.colorants.product', 'name sku currentStock attrs unit'),
    session
  );
  if (!shade || !shade.isActive) throw httpError('Shade not found.', 404);
  return shade;
}

function usageFromFormula(formula) {
  const base = formula.baseProduct;
  const colorants = (formula.colorants || []).map((line) => ({
    product: line.product,
    millilitres: Number(line.millilitres),
  }));
  return { base, colorants, sellingPrice: Number(formula.sellingPrice || base?.sellingPrice || 0) };
}

function assertStock(usage) {
  if (!usage.base) throw httpError('Formula is missing a base tin.');
  if (Number(usage.base.currentStock) < 1) {
    throw httpError(`Not enough ${usage.base.name} (need 1 tin).`);
  }
  for (const line of usage.colorants) {
    const product = line.product;
    if (!product) throw httpError('Formula has a missing colorant.');
    if (Number(product.currentStock) < line.millilitres) {
      throw httpError(`Not enough ${product.name} (need ${line.millilitres} ml).`);
    }
  }
}

async function previewMix({ shadeId, packLitres }) {
  const pack = normalizePack(packLitres);
  if (!pack) throw httpError('Pack size must be 1L, 4L, 10L or 20L.');
  const shade = await populateShade(shadeId);
  const formula = formulaFor(shade, pack);
  if (!formula) throw httpError(`No formula for ${pack}L.`);
  const usage = usageFromFormula(formula);
  let ok = true;
  let message = '';
  try {
    assertStock(usage);
  } catch (err) {
    ok = false;
    message = err.message;
  }
  return { shade, packLitres: pack, usage, ok, message };
}

async function findOrCreateTintedProduct(shade, formula, pack, session) {
  const base = formula.baseProduct;
  const sku = tintedSku(base.sku, shade.code, pack);
  let query = Product.findOne({ sku, isActive: true });
  if (session) query = query.session(session);
  let product = await query;
  const name = `${base.name} · ${shade.code} ${shade.name}`.slice(0, 120);
  const attrs = {
    role: 'tinted',
    tinted: true,
    shadeId: String(shade._id),
    shadeCode: shade.code,
    shadeName: shade.name,
    packLitres: pack,
    swatch: shade.swatch,
  };
  const sellingPrice = Number(formula.sellingPrice || base.sellingPrice || 0);
  const saveOpts = session ? { session } : undefined;
  if (product) {
    product.name = name;
    product.sellingPrice = sellingPrice;
    product.attrs = { ...(product.attrs || {}), ...attrs };
    product.purchasePrice = base.purchasePrice || product.purchasePrice;
    await product.save(saveOpts);
    return product;
  }

  const doc = {
    name,
    sku,
    brand: base.brand,
    category: base.category,
    purchasePrice: base.purchasePrice || 0,
    sellingPrice,
    commissionPercent: base.commissionPercent || 0,
    vatInclusive: base.vatInclusive !== false,
    vatRate: base.vatRate || 13,
    unit: base.unit,
    warehouse: base.warehouse,
    currentStock: 0,
    minStock: 0,
    attrs,
    isActive: true,
  };
  if (session) {
    return (await Product.create([doc], { session }))[0];
  }
  return Product.create(doc);
}

async function mixAndStock({ shadeId, packLitres, warehouseId, userId }) {
  const pack = normalizePack(packLitres);
  if (!pack) throw httpError('Pack size must be 1L, 4L, 10L or 20L.');

  return withOptionalTransaction(async (session) => {
    const shade = await populateShade(shadeId, session);
    const formula = formulaFor(shade, pack);
    if (!formula) throw httpError(`No formula for ${pack}L.`);
    const usage = usageFromFormula(formula);
    assertStock(usage);

    const warehouse = await resolveWarehouseId(warehouseId || usage.base.warehouse);
    const ref = `MIX-${shade.code}-${pack}L`;

    await changeStock({
      productId: usage.base._id,
      productName: usage.base.name,
      delta: -1,
      session,
      warehouseId: warehouse,
      type: 'mix_out',
      reference: ref,
      userId,
      notes: `Tint ${shade.code} ${pack}L base`,
    });

    for (const line of usage.colorants) {
      await changeStock({
        productId: line.product._id,
        productName: line.product.name,
        delta: -line.millilitres,
        session,
        warehouseId: warehouse,
        type: 'mix_out',
        reference: ref,
        userId,
        notes: `${line.millilitres} ml ${shade.code}`,
      });
    }

    const tinted = await findOrCreateTintedProduct(shade, formula, pack, session);
    const mixCost = (Number(usage.base?.purchasePrice) || 0) + (usage.colorants || []).reduce(
      (sum, line) => sum + (Number(line.product?.purchasePrice) || 0) * (Number(line.millilitres) || 0),
      0
    );
    await changeStock({
      productId: tinted._id,
      productName: tinted.name,
      delta: 1,
      session,
      warehouseId: warehouse,
      type: 'mix_in',
      reference: ref,
      userId,
      notes: `Produced ${shade.code} ${pack}L`,
      lotCost: mixCost,
      batchNo: ref,
    });

    const ready = await sessionQuery(
      Product.findById(tinted._id)
        .populate('category', 'name')
        .populate('brand', 'name')
        .populate('unit', 'name shortName'),
      session
    );

    // Money for the mixed tin posts when it is sold. This call keeps mix on the
    // same helper; empty accounts write no journal lines.
    await postCharge({
      tenant: ready?.tenantId,
      tax: { vatAmount: 0 },
      accounts: {},
      source: {
        type: 'mix',
        id: ready?._id,
        reference: ref,
        description: `Mix ${ref}`,
        userId,
      },
      session,
    });

    return { product: ready, shade, packLitres: pack, usage };
  });
}

module.exports = { previewMix, mixAndStock, formulaFor, populateShade };
