function sku(prefix, key) {
  return `${prefix}${String(key || 'X').slice(0, 2).toUpperCase()}${Date.now().toString(36).slice(-5)}`.slice(0, 24);
}

async function shopBasics(session) {
  const [unitsRes, warehousesRes] = await Promise.all([session.get('/units'), session.get('/warehouses')]);
  const unit = unitsRes.data?.data?.[0]?._id;
  const warehouse = warehousesRes.data?.data?.[0]?._id;
  if (!warehouse) throw new Error('No warehouse');
  return { unit, warehouse };
}

async function createProduct(session, body) {
  const res = await session.post('/products', body);
  if (res.status !== 201) throw new Error(`Product ${body.name}: ${JSON.stringify(res.data)}`);
  return res.data.data;
}

async function seedPaintCatalog(session, { secret = 'paint', key = 'p' } = {}) {
  const { unit, warehouse } = await shopBasics(session);
  const brand = await session.post('/brands', { name: `${secret}-paint` });
  const category = await session.post('/categories', { name: `${secret}-coatings` });
  const base = await createProduct(session, {
    name: `${secret}-base-4L`,
    sku: sku('PB', key),
    sellingPrice: 1800,
    purchasePrice: 1100,
    currentStock: 20,
    unit,
    warehouse,
    brand: brand.data?.data?._id,
    category: category.data?.data?._id,
    attrs: { role: 'paint_base', packLitres: 4 },
  });
  const colorant = await createProduct(session, {
    name: `${secret}-oxide-red`,
    sku: sku('PC', key),
    sellingPrice: 8,
    purchasePrice: 4,
    currentStock: 5000,
    unit,
    warehouse,
    attrs: { role: 'colorant' },
  });
  const shade = await session.post('/paint/shades', {
    code: `S-${key}-${Date.now().toString(36).slice(-4)}`.toUpperCase(),
    name: `${secret} sand`,
    swatch: '#c4a574',
    brand: brand.data?.data?._id,
    formulas: [{
      packLitres: 4,
      baseProduct: base._id,
      sellingPrice: 2200,
      colorants: [{ product: colorant._id, millilitres: 40 }],
    }],
  });
  if (shade.status !== 201) throw new Error(`Shade: ${JSON.stringify(shade.data)}`);
  return { unit, warehouse, brand: brand.data?.data, category: category.data?.data, base, colorant, shade: shade.data.data };
}

async function seedCafeCatalog(session, { secret = 'cafe', key = 'c' } = {}) {
  const { unit, warehouse } = await shopBasics(session);
  const category = await session.post('/categories', { name: `${secret}-drinks` });
  const beans = await createProduct(session, {
    name: `${secret}-beans`,
    sku: sku('CB', key),
    sellingPrice: 2,
    purchasePrice: 1.2,
    currentStock: 5000,
    unit,
    warehouse,
    attrs: { role: 'ingredient' },
  });
  const milk = await createProduct(session, {
    name: `${secret}-milk`,
    sku: sku('CM', key),
    sellingPrice: 1,
    purchasePrice: 0.4,
    currentStock: 8000,
    unit,
    warehouse,
    attrs: { role: 'ingredient' },
  });
  const oat = await createProduct(session, {
    name: `${secret}-oat`,
    sku: sku('CO', key),
    sellingPrice: 1.2,
    purchasePrice: 0.6,
    currentStock: 4000,
    unit,
    warehouse,
    attrs: { role: 'ingredient' },
  });
  const cup = await createProduct(session, {
    name: `${secret}-cup`,
    sku: sku('CU', key),
    sellingPrice: 5,
    purchasePrice: 3,
    currentStock: 400,
    unit,
    warehouse,
    attrs: { role: 'ingredient' },
  });
  const latte = await createProduct(session, {
    name: `${secret}-latte`,
    sku: sku('CL', key),
    sellingPrice: 280,
    purchasePrice: 0,
    currentStock: 0,
    unit,
    warehouse,
    category: category.data?.data?._id,
    attrs: { role: 'menu' },
  });
  const recipe = await session.put(`/cafe/recipes/${latte._id}`, {
    recipe: [
      { product: beans._id, productName: beans.name, qty: 18, role: 'shot', scale: true },
      { product: milk._id, productName: milk.name, qty: 200, role: 'milk', scale: true },
      { product: cup._id, productName: cup.name, qty: 1, role: 'cup', scale: false },
    ],
    modifierGroups: [
      {
        name: 'Size',
        required: true,
        options: [
          { name: 'Regular', priceDelta: 0, scale: 1 },
          { name: 'Large', priceDelta: 50, scale: 1.3 },
        ],
      },
      {
        name: 'Milk',
        required: true,
        options: [
          { name: 'Dairy', priceDelta: 0, replaceRole: 'milk', replaceProduct: milk._id },
          { name: 'Oat', priceDelta: 40, replaceRole: 'milk', replaceProduct: oat._id },
        ],
      },
      {
        name: 'Extra shot',
        required: false,
        options: [
          { name: 'None', priceDelta: 0 },
          { name: 'Extra shot', priceDelta: 50, extraRole: 'shot', extraQty: 1 },
        ],
      },
    ],
  });
  if (recipe.status !== 200) throw new Error(`Recipe: ${JSON.stringify(recipe.data)}`);
  return { unit, warehouse, category: category.data?.data, beans, milk, oat, cup, latte };
}

module.exports = { seedPaintCatalog, seedCafeCatalog };
