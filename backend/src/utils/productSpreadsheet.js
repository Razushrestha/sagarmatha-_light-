const ExcelJS = require('exceljs');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');

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
  category: ['category', 'category name'],
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

function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const label = normalizeHeader(cell);
    if (!label) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(label) && map[key] == null) map[key] = index;
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

async function resolveNamed(Model, name, cache) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return undefined;
  const key = `${Model.modelName}:${trimmed.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  const existing = await Model.findOne({ name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') });
  if (existing) {
    cache.set(key, existing._id);
    return existing._id;
  }
  try {
    const created = await Model.create({ name: trimmed });
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

async function importRows(rawRows) {
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
  const errors = [];
  const nameCache = new Map();

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
      if (has('category')) payload.category = await resolveNamed(Category, get('category'), nameCache);
      if (has('brand')) payload.brand = await resolveNamed(Brand, get('brand'), nameCache);
      if (has('purchasePrice')) payload.purchasePrice = toNumber(get('purchasePrice'), 0);
      if (has('wholesalePrice') && get('wholesalePrice') !== '') payload.wholesalePrice = toNumber(get('wholesalePrice'));
      if (has('minStock')) payload.minStock = toNumber(get('minStock'), 5);
      if (has('currentStock')) payload.currentStock = toNumber(get('currentStock'), 0);
      if (has('status')) payload.isActive = isActiveStatus(get('status'));
      if (has('model')) payload.model = get('model') || undefined;
      if (has('description')) payload.description = get('description') || undefined;

      const existing = await Product.findOne({ sku: new RegExp(`^${escapeRegex(sku)}$`, 'i') });
      if (existing) {
        Object.assign(existing, payload);
        await existing.save();
        updated += 1;
      } else {
        await Product.create(payload);
        created += 1;
      }
    } catch (error) {
      const message = error.code === 11000
        ? 'This SKU or barcode already exists.'
        : (error.message || 'Could not save this row.');
      errors.push({ row: rowNumber, sku, message });
    }
  }

  return { created, updated, skipped, errors };
}

module.exports = {
  HEADERS,
  getExportRows,
  buildWorkbook,
  toCsv,
  parseSpreadsheetBuffer,
  importRows,
};
