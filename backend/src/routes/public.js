const express = require('express');
const platformController = require('../controllers/platformController');
const { signupLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.get('/config', platformController.publicConfig);
router.post('/signup', signupLimiter(), platformController.signup);

module.exports = router;
