const express = require('express');
const { protect, authorize, requireShopTenant } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiters');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/login', loginLimiter(), authController.login);
router.post('/magic-login', loginLimiter(), authController.magicLogin);
router.post('/logout', authController.logout);
router.get('/me', protect, authController.getMe);
router.post('/change-password', protect, authController.changePassword);
router.get('/users', protect, requireShopTenant, authorize('users:manage', 'settings:manage'), authController.getUsers);
router.get('/roles', protect, requireShopTenant, authorize('users:manage', 'settings:manage'), authController.getRoles);
router.put('/users/:id', protect, requireShopTenant, authorize('users:manage', 'settings:manage'), authController.updateUser);
router.post('/register', protect, requireShopTenant, authorize('users:manage'), authController.register);

module.exports = router;
