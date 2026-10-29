const Product = require('../models/Product');

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function asId(value) {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

function hasRecipe(product) {
  return Array.isArray(product?.attrs?.recipe) && product.attrs.recipe.length > 0;
}

function mergeLines(lines) {
  const map = new Map();
  for (const line of lines) {
    const id = asId(line.product);
    const qty = Number(line.qty);
    if (!id || !(qty > 0)) continue;
    const prev = map.get(id);
    if (prev) prev.qty += qty;
    else {
      map.set(id, {
        product: id,
        productName: line.productName || '',
        qty,
        role: line.role || '',
      });
    }
  }
  return [...map.values()];
}

function resolveRecipe(product, modifiers = []) {
  const recipe = product?.attrs?.recipe || [];
  if (!recipe.length) return [];
  const groups = product.attrs?.modifierGroups || [];
  let scale = 1;
  const replace = {};
  const extraByRole = {};

  for (const mod of modifiers) {
    const group = groups.find((row) => row.name === mod.group || row.id === mod.group);
    const opt = (group?.options || []).find((row) => row.name === mod.option || row.id === mod.option);
    if (!opt) continue;
    if (opt.scale != null && opt.scale !== '') scale = Number(opt.scale) || 1;
    if (opt.replaceRole && opt.replaceProduct) replace[opt.replaceRole] = asId(opt.replaceProduct);
    if (opt.extraRole) {
      extraByRole[opt.extraRole] = (extraByRole[opt.extraRole] || 0) + (Number(opt.extraQty) || 1);
    }
  }

  const lines = recipe.map((row) => {
    const role = row.role || '';
    const scaleThis = row.scale === false ? 1 : scale;
    const extra = extraByRole[role] || 0;
    return {
      product: replace[role] || asId(row.product),
      productName: row.productName || '',
      qty: Number(row.qty) * scaleThis * (1 + extra),
      role,
    };
  });
  return mergeLines(lines);
}

function cleanModifiers(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => ({
      group: String(row.group || '').trim(),
      option: String(row.option || '').trim(),
      priceDelta: Number(row.priceDelta) || 0,
    }))
    .filter((row) => row.group && row.option);
}

async function stampRecipeItems(items) {
  if (!Array.isArray(items) || !items.length) return items;
  const ids = items.map((item) => item.product).filter(Boolean);
  const products = await Product.find({ _id: { $in: ids } }).select('name attrs purchasePrice').lean();
  const byId = new Map(products.map((row) => [String(row._id), row]));
  const ingredientIds = new Set();

  const stamped = items.map((item) => {
    const product = byId.get(String(item.product));
    const modifiers = cleanModifiers(item.modifiers);
    const recipeDeducted = resolveRecipe(product, modifiers);
    recipeDeducted.forEach((line) => ingredientIds.add(String(line.product)));
    if (item.complimentary && !String(item.compReason || '').trim()) {
      throw httpError('Complimentary needs a reason.');
    }
    return {
      ...item,
      modifiers,
      recipeDeducted,
      complimentary: Boolean(item.complimentary),
      compReason: item.complimentary ? String(item.compReason).trim() : undefined,
    };
  });

  if (ingredientIds.size) {
    const ings = await Product.find({ _id: { $in: [...ingredientIds] } }).select('name purchasePrice').lean();
    const names = new Map(ings.map((row) => [String(row._id), row.name]));
    const costs = new Map(ings.map((row) => [String(row._id), Number(row.purchasePrice) || 0]));
    for (const item of stamped) {
      let unitCost = 0;
      for (const line of item.recipeDeducted) {
        line.productName = names.get(String(line.product)) || line.productName;
        unitCost += (Number(line.qty) || 0) * (costs.get(String(line.product)) || 0);
      }
      item.costPrice = item.complimentary ? 0 : Math.round(unitCost * 100) / 100;
    }
  }
  return stamped;
}

function cleanRecipe(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => ({
      product: asId(row.product),
      productName: String(row.productName || '').trim(),
      qty: Number(row.qty),
      role: String(row.role || '').trim(),
      scale: row.scale !== false,
    }))
    .filter((row) => row.product && row.qty > 0);
}

function cleanGroups(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 8).map((group, gi) => ({
    id: String(group.id || `g${gi}`),
    name: String(group.name || '').trim() || `Group ${gi + 1}`,
    required: group.required !== false,
    options: (group.options || []).slice(0, 12).map((opt, oi) => ({
      id: String(opt.id || `o${oi}`),
      name: String(opt.name || '').trim() || `Option ${oi + 1}`,
      priceDelta: Number(opt.priceDelta) || 0,
      scale: opt.scale == null || opt.scale === '' ? undefined : Number(opt.scale),
      replaceRole: String(opt.replaceRole || '').trim() || undefined,
      replaceProduct: asId(opt.replaceProduct) || undefined,
      extraRole: String(opt.extraRole || '').trim() || undefined,
      extraQty: opt.extraQty == null || opt.extraQty === '' ? undefined : Number(opt.extraQty),
    })).filter((opt) => opt.name),
  })).filter((group) => group.options.length);
}

async function catalogMargins() {
  const menus = await Product.find({ isActive: true, 'attrs.recipe.0': { $exists: true } })
    .select('name sku sellingPrice attrs')
    .lean();
  const ids = new Set();
  menus.forEach((menu) => (menu.attrs.recipe || []).forEach((row) => ids.add(asId(row.product))));
  const ings = await Product.find({ _id: { $in: [...ids] } }).select('name purchasePrice').lean();
  const costMap = new Map(ings.map((row) => [String(row._id), Number(row.purchasePrice) || 0]));
  return menus.map((menu) => {
    const cost = (menu.attrs.recipe || []).reduce(
      (sum, row) => sum + (Number(row.qty) || 0) * (costMap.get(asId(row.product)) || 0),
      0
    );
    const price = Number(menu.sellingPrice) || 0;
    return {
      _id: menu._id,
      name: menu.name,
      sku: menu.sku,
      sellingPrice: Math.round(price * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      profit: Math.round((price - cost) * 100) / 100,
      margin: price > 0 ? (price - cost) / price : 0,
    };
  }).sort((a, b) => b.profit - a.profit);
}

module.exports = {
  hasRecipe,
  resolveRecipe,
  stampRecipeItems,
  catalogMargins,
  cleanRecipe,
  cleanGroups,
  cleanModifiers,
  httpError,
};
