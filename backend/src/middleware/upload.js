const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { tenantUploadDir } = require('../utils/storageUsage');
const { assertStorageLimit } = require('../services/planService');

function ensureTenantDir(req) {
  const dir = tenantUploadDir(req.tenantId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      cb(null, ensureTenantDir(req));
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${unique}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed.'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const allowed = ['.csv', '.xlsx', '.xls'];
    if (allowed.some((ext) => name.endsWith(ext))) cb(null, true);
    else cb(new Error('Upload a CSV or Excel file.'), false);
  },
  limits: { fileSize: 8 * 1024 * 1024 },
});

async function enforceStorageQuota(req, res, next) {
  try {
    if (!req.tenant) return next();
    const incoming = Number(req.headers['content-length'] || 0);
    await assertStorageLimit(req.tenant, incoming);
    next();
  } catch (error) {
    return res.status(error.statusCode || 403).json({ success: false, message: error.message });
  }
}

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Image is larger than 20MB.' });
  }
  return res.status(400).json({ success: false, message: err.message || 'Upload failed.' });
}

module.exports = { upload, spreadsheetUpload, enforceStorageQuota, handleUploadError };
