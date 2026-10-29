const express = require('express');
const { protect, authorize, requireShopTenant } = require('../middleware/auth');
const { requireModule } = require('../middleware/requireModule');
const hotelController = require('../controllers/hotelController');

const router = express.Router();

const desk = authorize('hotel:desk');
const deskWrite = authorize('hotel:desk');
const hk = authorize('hotel:housekeeping', 'hotel:desk');

router.use(protect, requireShopTenant, requireModule('rooms'));

router.get('/rooms', authorize('hotel:desk', 'hotel:housekeeping'), hotelController.listRooms);
router.post('/rooms', authorize('settings:manage', 'product:create', 'hotel:desk'), hotelController.saveRoom);
router.put('/rooms/:id', authorize('settings:manage', 'product:edit', 'hotel:desk'), hotelController.saveRoom);
router.post('/rooms/:id/status', hk, hotelController.setRoomStatus);
router.get('/staff', hk, hotelController.listStaff);

router.get('/guests', desk, hotelController.searchGuests);
router.get('/stays', authorize('hotel:desk', 'pos:access'), hotelController.listStays);
router.get('/rack', desk, hotelController.getRack);
router.get('/rates', desk, hotelController.listRatePlans);
router.get('/rates/quote', desk, hotelController.quoteRate);
router.post('/rates', deskWrite, hotelController.saveRatePlan);
router.put('/rates/:id', deskWrite, hotelController.saveRatePlan);
router.get('/report', authorize('hotel:desk', 'reports:view'), hotelController.dailyReport);
router.get('/audit', authorize('hotel:desk', 'reports:view'), hotelController.listAudits);
router.post('/audit/close', deskWrite, hotelController.closeNight);
router.post('/audit/:id/reopen', authorize('hotel:desk', 'settings:manage'), hotelController.reopenNight);
router.post('/stays/reserve', deskWrite, hotelController.reserve);
router.post('/stays/check-in', deskWrite, hotelController.checkIn);
router.put('/stays/:id/guest', deskWrite, hotelController.updateGuest);
router.post('/stays/:id/arrive', deskWrite, hotelController.arrive);
router.post('/stays/:id/extend', deskWrite, hotelController.extendStay);
router.post('/stays/:id/move', deskWrite, hotelController.moveStay);
router.post('/stays/:id/rate', deskWrite, hotelController.changeRate);
router.post('/stays/:id/cancel', deskWrite, hotelController.cancelStay);
router.post('/stays/:id/no-show', deskWrite, hotelController.noShow);
router.post('/stays/:id/check-out', deskWrite, hotelController.checkOut);

router.get('/folios/:id', authorize('hotel:desk', 'invoice:read', 'accounting:read'), hotelController.getFolio);
router.post('/folios/:id/email', deskWrite, hotelController.emailFolio);
router.post('/folios/:id/settle', authorize('hotel:desk', 'accounting:write'), hotelController.settleFolio);
router.post('/folios/:id/deposit', authorize('hotel:desk', 'accounting:write'), hotelController.depositFolio);
router.post('/folios/:id/city-ledger', authorize('hotel:desk', 'accounting:write'), hotelController.cityLedgerFolio);
router.post('/folios/:id/split', deskWrite, hotelController.splitFolio);
router.post('/folios/:id/move', deskWrite, hotelController.moveFolioCharge);

router.get('/channel', desk, hotelController.listChannel);
router.post('/channel', deskWrite, hotelController.createChannel);
router.post('/channel/:id/import', deskWrite, hotelController.importChannel);

module.exports = router;
