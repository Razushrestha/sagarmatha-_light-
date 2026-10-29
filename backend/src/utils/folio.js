const mongoose = require('mongoose');

function parseFolioId(value) {
  if (value == null || value === '') return null;
  const id = String(value._id || value);
  return mongoose.isValidObjectId(id) ? id : null;
}

module.exports = { parseFolioId };
