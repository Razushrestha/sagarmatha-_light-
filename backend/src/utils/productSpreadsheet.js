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
  sellingPrice: ['selling price', 'selling', 'price', 'sale price', 'mrp'],
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
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const label = normalizeHeader(cell);
    if (!label) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(label)) map[key] = index;
    }
  });
  return map;
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value.text) return String(value.text).trim();
  if (typeof value === 'object' && value.result != null) return String(value.result).trim();
  return String(value).trim();
}

function toNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function isActiveStatus(value) {
  const v = String(value || 'active').trim().toLowerCase();
  return !['inactive', 'no', 'false', '0', 'disabled'].includes(v);
}

async function resolveNamed(Model, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return undefined;
  const existing = await Model.findOne({ name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') });
  if (existing) return existing._id;
  const created = await Model.create({ name: trimmed });
  return created._id;
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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const input = String(text).replace(/^\uFEFF/, '');
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
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

async function parseSpreadsheetBuffer(buffer, originalname = '') {
  const name = String(originalname).toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return parseCsv(buffer.toString('utf8'));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows = [];
  sheet.eachRow((row) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = cellText(cell.value);
    });
    rows.push(values.map((v) => (v == null ? '' : v)));
  });
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

async function importRows(rawRows) {
  if (!rawRows.length) {
    return { created: 0, updated: 0, skipped: 0, errors: [{ row: 1, message: 'The file is empty.' }] };
  }

  const headerMap = mapHeaders(rawRows[0]);
  if (headerMap.name == null || headerMap.sku == null || headerMap.sellingPrice == null) {
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ row: 1, message: 'Required columns: Name, SKU, Selling Price.' }],
    };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 1; i < rawRows.length; i += 1) {
    const raw = rawRows[i];
    const rowNumber = i + 1;
    const get = (key) => (headerMap[key] == null ? '' : cellText(raw[headerMap[key]]));

    const name = get('name');
    const sku = get('sku');
    const sellingPrice = toNumber(get('sellingPrice'), NaN);

    if (!name && !sku) {
      skipped += 1;
      continue;
    }
    if (!name || !sku || !Number.isFinite(sellingPrice) || sellingPrice < 0) {
      errors.push({ row: rowNumber, sku, message: 'Name, SKU, and a valid Selling Price are required.' });
      continue;
    }

    try {
      const payload = {
        name,
        sku,
        barcode: get('barcode') || undefined,
        category: await resolveNamed(Category, get('category')),
        brand: await resolveNamed(Brand, get('brand')),
        purchasePrice: toNumber(get('purchasePrice'), 0),
        sellingPrice,
        wholesalePrice: get('wholesalePrice') === '' ? undefined : toNumber(get('wholesalePrice')),
        minStock: toNumber(get('minStock'), 5),
        currentStock: toNumber(get('currentStock'), 0),
        isActive: isActiveStatus(get('status')),
        model: get('model') || undefined,
        description: get('description') || undefined,
      };

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
      errors.push({ row: rowNumber, sku, message: error.message || 'Could not save this row.' });
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
