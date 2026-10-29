const express = require('express');
const platformController = require('../controllers/platformController');
const publicHotelController = require('../controllers/publicHotelController');
const { signupLimiter, bookLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.get('/config', platformController.publicConfig);
router.post('/signup', signupLimiter(), platformController.signup);
router.get('/hotel/:slug', publicHotelController.hotelWidget);
router.post('/hotel/:slug/book', bookLimiter(), publicHotelController.hotelBook);

module.exports = router;
