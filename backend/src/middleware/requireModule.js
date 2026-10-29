const { hasModule } = require('../config/industry');

function requireModule(name) {
  return (req, res, next) => {
    if (!hasModule(req.tenant, name)) {
      return res.status(404).json({ success: false, message: 'Not available for this shop.' });
    }
    next();
  };
}

module.exports = { requireModule };
