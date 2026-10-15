const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const FULL_SIZE = Number(process.env.IMAGE_MAX_PX || 1280);
const THUMB_SIZE = Number(process.env.IMAGE_THUMB_PX || 320);
const QUALITY = Number(process.env.IMAGE_WEBP_QUALITY || 78);

function imageOpts() {
  try {
    const s = require('../services/platformSettings').getCached();
    return {
      full: Number(s.imageMaxPx || FULL_SIZE),
      thumb: Number(s.imageThumbPx || THUMB_SIZE),
      quality: Number(s.imageWebpQuality || QUALITY),
    };
  } catch {
    return { full: FULL_SIZE, thumb: THUMB_SIZE, quality: QUALITY };
  }
}

async function compressProductImage(inputPath, destDir, baseName) {
  const { full, thumb, quality } = imageOpts();
  const fullName = `${baseName}.webp`;
  const thumbName = `${baseName}-thumb.webp`;
  const fullPath = path.join(destDir, fullName);
  const thumbPath = path.join(destDir, thumbName);

  await sharp(inputPath)
    .rotate()
    .resize(full, full, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toFile(fullPath);

  await sharp(inputPath)
    .rotate()
    .resize(thumb, thumb, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: Math.min(70, quality) })
    .toFile(thumbPath);

  const bytes = fs.statSync(fullPath).size + fs.statSync(thumbPath).size;
  return { fullName, thumbName, bytes, fullPath, thumbPath };
}

function unlinkQuiet(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

module.exports = { compressProductImage, unlinkQuiet, FULL_SIZE, THUMB_SIZE, QUALITY };
