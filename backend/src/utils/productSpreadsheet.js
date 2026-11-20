const ExcelJS = require('exceljs');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const { Unit } = require('../models/Unit');
const { getDefaultWarehouseId } = require('./warehouse');

const HEADERS = [
  { key: 'name', label: 'Name' },
  { key: 'sku', label: 'SKU' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'category', label: 'Category' },
  { key: 'brand', label: 'Brand' },
  { key: 'purchasePrice', label: 'Purchase Price' },
  { key: 'sellingPrice', label: 'Selling Price' },
  { key: 'wholesalePrice', label: 'Wholesale Price' },
  { key: 'minStock', label: 'Min Stock' },
  { key: 'currentStock', label: 'Stock' },
  { key: 'status', label: 'Status' },
  { key: 'model', label: 'Model' },
  { key: 'description', label: 'Description' },
];

const HEADER_ALIASES = {
  name: ['name', 'product', 'product name', 'item', 'item name'],
  sku: ['sku', 'code', 'item code', 'product code'],
  barcode: ['barcode', 'bar code', 'ean', 'upc'],
  category: [
    'category', 'category name', 'product category', 'item category', 'cat',
    'group', 'item group', 'product group', 'type', 'product type', 'class',
  ],
  subcategory: ['subcategory', 'sub category', 'sub-category', 'sub group'],
  brand: ['brand', 'brand name', 'manufacturer'],
  purchasePrice: ['purchase price', 'purchase', 'cost', 'cost price', 'buying price'],
  sellingPrice: ['selling price', 'selling', 'price', 'sale price', 'mrp', 'unit price', 'rate'],
  wholesalePrice: ['wholesale price', 'wholesale'],
  minStock: ['min stock', 'minimum stock', 'reorder'],
  currentStock: ['stock', 'current stock', 'qty', 'quantity', 'opening stock'],
  status: ['status', 'active'],
  model: ['model'],
  description: ['description', 'notes'],
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/\[object object\]/gi, '')
    .trim()
    .toLowerCase()
    .replace(/[*:\n]/g, ' ')
    .replace(/\((npr|rs|rs\.)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerMatches(label, aliases) {
  if (aliases.includes(label)) return true;
  return aliases.some((alias) => label === alias || label.endsWith(` ${alias}`) || label.startsWith(`${alias} `));
}

function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const label = normalizeHeader(cell);
    if (!label) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[key] == null && headerMatches(label, aliases)) map[key] = index;
    }
  });
  return map;
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return String(value).trim();
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || '').join('').trim();
  }
  if (value.text != null) return String(value.text).trim();
  if (value.result != null) return cellText(value.result);
  if (value.hyperlink && value.text) return String(value.text).trim();
  return '';
}

function toNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/npr|rs\.?|₹/gi, '')
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function isActiveStatus(value) {
  const v = String(value || 'active').trim().toLowerCase();
  return !['inactive', 'no', 'false', '0', 'disabled'].includes(v);
}

function generateSku(name) {
  const base = String(name || 'SKU')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18) || 'SKU';
  return `${base}-${Date.now().toString(36).slice(-5)}`.slice(0, 30);
}

function normalizeCatKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

const CATEGORY_RULES = [
  { re: /\b(rccb|rcbo|elcb|mcb|mccb)\b/i, name: 'MCB & RCCB' },
  { re: /\b(socket|plug point|power point)\b/i, name: 'Sockets' },
  { re: /\b(switch|gang|modular|d\.?\s*p\.?|double pole)\b/i, name: 'Switches' },
  { re: /\b(wire|cable|flexible|flex)\b/i, name: 'Wires & Cables' },
  { re: /\b(bulb|tube light|panel light|downlight|luminaire|led)\b/i, name: 'Lighting' },
  { re: /\b(fan)\b/i, name: 'Fans' },
  { re: /\b(pipe|conduit)\b/i, name: 'Conduits & Pipes' },
  { re: /\b(drill|grinder|tool)\b/i, name: 'Tools' },
  { re: /\b(ups|inverter|battery)\b/i, name: 'Power Backup' },
  { re: /\b(camera|cctv|dvr)\b/i, name: 'CCTV' },
  { re: /\b(pump)\b/i, name: 'Pumps' },
  { re: /\b(distribution board|\bdb\b|enclosure)\b/i, name: 'Distribution Boards' },
  { re: /\b(bell|buzzer)\b/i, name: 'Bells' },
  { re: /\b(holder|batten)\b/i, name: 'Holders' },
];

function inferCategoryFromProductName(name) {
  const text = String(name || '');
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(text)) return rule.name;
  }
  return '';
}

function titleCategory(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function matchExistingCategory(name, existing) {
  const key = normalizeCatKey(name);
  if (!key) return null;
  const exact = existing.find((c) => normalizeCatKey(c.name) === key);
  if (exact) return exact;
  const stem = key.replace(/s$/, '');
  return existing.find((c) => normalizeCatKey(c.name).replace(/s$/, '') === stem) || null;
}

async function resolveNamed(Model, name, cache, extras = {}) {
  const trimmed = titleCategory(name);
  if (!trimmed) return undefined;
  const key = `${Model.modelName}:${trimmed.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  const existing = extras.existing
    ? matchExistingCategory(trimmed, extras.existing)
    : await Model.findOne({ name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') });
  if (existing) {
    cache.set(key, existing._id);
    return existing._id;
  }
  try {
    const created = await Model.create({
      name: trimmed,
      isActive: true,
      ...(extras.parent ? { parent: extras.parent } : {}),
    });
    if (Array.isArray(extras.existing)) extras.existing.push({ _id: created._id, name: created.name });
    if (typeof extras.onCreate === 'function') extras.onCreate(created);
    cache.set(key, created._id);
    return created._id;
  } catch (error) {
    if (error.code === 11000) {
      const again = await Model.findOne({ name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') });
      if (again) {
        cache.set(key, again._id);
        return again._id;
      }
    }
    throw error;
  }
}

async function resolveCategory({ explicit, subcategory, productName, brandName, cache, existing, onCreate }) {
  let fromFile = String(explicit || '').trim();
  if (fromFile && brandName && fromFile.toLowerCase() === String(brandName).trim().toLowerCase()) {
    fromFile = '';
  }
  const inferred = inferCategoryFromProductName(productName);
  const raw = fromFile || inferred;
  if (!raw && !subcategory) return undefined;

  const parts = String(raw || inferred)
    .split(/\s*[>\/|,]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const parentName = parts.length > 1 ? parts[0] : (fromFile || inferred);
  const leafName = String(subcategory || '').trim() || (parts.length > 1 ? parts[parts.length - 1] : parentName);
  if (!leafName) return undefined;

  let parentId;
  if (parentName && leafName && normalizeCatKey(parentName) !== normalizeCatKey(leafName)) {
    parentId = await resolveNamed(Category, parentName, cache, { existing, onCreate });
  }
  return resolveNamed(Category, leafName, cache, { existing, onCreate, parent: parentId });
}

function productToRow(product) {
  return {
    name: product.name || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    category: product.category?.name || '',
    brand: product.brand?.name || '',
    purchasePrice: product.purchasePrice ?? 0,
    sellingPrice: product.sellingPrice ?? 0,
    wholesalePrice: product.wholesalePrice ?? '',
    minStock: product.minStock ?? 5,
    currentStock: product.currentStock ?? 0,
    status: product.isActive === false ? 'Inactive' : 'Active',
    model: product.model || '',
    description: product.description || '',
  };
}

async function getExportRows() {
  const products = await Product.find()
    .populate('category', 'name')
    .populate('brand', 'name')
    .select('-priceHistory -images')
    .sort({ name: 1 })
    .lean();
  return products.map(productToRow);
}

async function buildWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');
  sheet.columns = HEADERS.map((h) => ({ header: h.label, key: h.key, width: 18 }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  return workbook;
}

function toCsv(rows) {
  const headers = HEADERS.map((h) => h.label);
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    const values = HEADERS.map((h) => {
      const raw = row[h.key] == null ? '' : String(row[h.key]);
      if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
      return raw;
    });
    lines.push(values.join(','));
  });
  return `\uFEFF${lines.join('\r\n')}`;
}

function detectDelimiter(firstLine) {
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const input = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstLine = input.split('\n').find((line) => line.trim()) || '';
  const delimiter = detectDelimiter(firstLine);
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function decodeTextBuffer(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le');
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const copy = Buffer.from(buf);
    copy.swap16();
    return copy.toString('utf16le');
  }
  return buf.toString('utf8');
}

function excelSheetToRows(sheet) {
  const colCount = Math.max(sheet.columnCount || 0, HEADERS.length);
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.from({ length: colCount }, () => '');
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = cellText(cell.value);
    });
    if (values.some((c) => String(c).trim() !== '')) rows.push(values);
  });
  return rows;
}

async function parseSpreadsheetBuffer(buffer, originalname = '') {
  const name = String(originalname).toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return parseCsv(decodeTextBuffer(buffer));
  }
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    return excelSheetToRows(sheet);
  } catch (error) {
    const asText = decodeTextBuffer(buffer);
    if (asText.includes(',') || asText.includes(';') || asText.includes('\t')) {
      return parseCsv(asText);
    }
    throw error;
  }
}

function findHeaderRow(rawRows) {
  const max = Math.min(rawRows.length, 25);
  let best = { index: 0, map: mapHeaders(rawRows[0] || []), score: 0 };
  for (let i = 0; i < max; i += 1) {
    const map = mapHeaders(rawRows[i]);
    const score = Object.keys(map).length;
    if (map.name != null && map.sellingPrice != null && score >= best.score) {
      best = { index: i, map, score };
      if (map.sku != null) break;
    }
    if (score > best.score) best = { index: i, map, score };
  }
  return best;
}

async function importRows(rawRows, options = {}) {
  if (!rawRows.length) {
    return { created: 0, updated: 0, skipped: 0, errors: [{ row: 1, message: 'The file is empty.' }] };
  }

  const { index: headerIndex, map: headerMap } = findHeaderRow(rawRows);
  if (headerMap.name == null || headerMap.sellingPrice == null) {
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{
        row: headerIndex + 1,
        message: 'Could not find Name and Selling Price columns. Use the Export file or a template with those headers.',
      }],
    };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let categoriesCreated = 0;
  const errors = [];
  const nameCache = new Map();
  const categoryLinks = new Map();
  const existingCategories = await Category.find({ isActive: { $ne: false } }).select('_id name').lean();
  const warehouseId = options.warehouseId || await getDefaultWarehouseId();
  const supplierId = options.supplierId || undefined;
  let defaultUnitId = options.unitId || undefined;
  if (!defaultUnitId) {
    const unit = await Unit.findOne({ isActive: true }).sort({ name: 1 }).select('_id').lean();
    defaultUnitId = unit?._id;
  }

  for (let i = headerIndex + 1; i < rawRows.length; i += 1) {
    const raw = rawRows[i];
    const rowNumber = i + 1;
    const get = (key) => (headerMap[key] == null ? '' : cellText(raw[headerMap[key]]));
    const has = (key) => headerMap[key] != null;

    let name = get('name');
    let sku = get('sku');
    let sellingPrice = toNumber(get('sellingPrice'), NaN);
    if (!Number.isFinite(sellingPrice) && has('purchasePrice')) {
      sellingPrice = toNumber(get('purchasePrice'), NaN);
    }

    if (!name && !sku) {
      skipped += 1;
      continue;
    }
    if (!name) {
      errors.push({ row: rowNumber, sku, message: 'Name is required.' });
      continue;
    }
    if (!sku) sku = generateSku(`${name}-${rowNumber}`);
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      errors.push({ row: rowNumber, sku, message: 'A valid Selling Price is required.' });
      continue;
    }

    try {
      const payload = { name, sku, sellingPrice };
      if (has('barcode')) payload.barcode = get('barcode') || undefined;
      const brandName = has('brand') ? get('brand') : '';
      if (brandName) payload.brand = await resolveNamed(Brand, brandName, nameCache);
      const categoryId = await resolveCategory({
        explicit: get('category'),
        subcategory: get('subcategory'),
        productName: name,
        brandName,
        cache: nameCache,
        existing: existingCategories,
        onCreate: () => { categoriesCreated += 1; },
      });
      if (categoryId) payload.category = categoryId;
      if (has('purchasePrice')) payload.purchasePrice = toNumber(get('purchasePrice'), 0);
      if (has('wholesalePrice') && get('wholesalePrice') !== '') payload.wholesalePrice = toNumber(get('wholesalePrice'));
      if (has('minStock')) payload.minStock = toNumber(get('minStock'), 5);
      if (has('currentStock')) payload.currentStock = toNumber(get('currentStock'), 0);
      if (has('status')) payload.isActive = isActiveStatus(get('status'));
      if (has('model')) payload.model = get('model') || undefined;
      if (has('description')) payload.description = get('description') || undefined;
      if (warehouseId) payload.warehouse = warehouseId;
      if (supplierId) payload.supplier = supplierId;
      if (defaultUnitId) payload.unit = defaultUnitId;

      const existing = await Product.findOne({ sku: new RegExp(`^${escapeRegex(sku)}$`, 'i') });
      let saved;
      if (existing) {
        const previousStock = existing.currentStock;
        const previousCategory = existing.category;
        Object.assign(existing, payload);
        // Keep existing inventory unless the file includes a Stock column.
        if (!has('currentStock')) existing.currentStock = previousStock;
        if (!payload.category) existing.category = previousCategory;
        saved = await existing.save();
        updated += 1;
      } else {
        if (!has('currentStock')) payload.currentStock = 0;
        saved = await Product.create(payload);
        created += 1;
      }
      const linkedCategory = saved?.category || payload.category;
      if (linkedCategory && saved?._id) {
        const key = String(linkedCategory);
        if (!categoryLinks.has(key)) categoryLinks.set(key, []);
        categoryLinks.get(key).push(saved._id);
      }
    } catch (error) {
      const message = error.code === 11000
        ? 'This SKU or barcode already exists.'
        : (error.message || 'Could not save this row.');
      errors.push({ row: rowNumber, sku, message });
    }
  }

  await Promise.all([...categoryLinks.entries()].map(([catId, productIds]) => (
    Category.updateOne(
      { _id: catId },
      { $addToSet: { relatedProducts: { $each: productIds } }, $set: { isActive: true } }
    )
  )));

  return { created, updated, skipped, errors, categoriesCreated };
}

module.exports = {
  HEADERS,
  getExportRows,
  buildWorkbook,
  toCsv,
  parseSpreadsheetBuffer,
  importRows,
};
