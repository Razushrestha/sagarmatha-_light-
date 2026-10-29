const HotelGuest = require('../models/HotelGuest');
const { scoped } = require('../utils/tenantQuery');
const { toStayGuest } = require('../utils/hotelGuest');

function escapeRx(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function upsertHotelGuest(req, guest, { countStay } = {}) {
  if (!guest?.guestPhone) return null;
  let row = await HotelGuest.findOne(scoped(req, { phone: guest.guestPhone }));
  if (!row && guest.guestIdNumber) {
    row = await HotelGuest.findOne(scoped(req, { idNumber: guest.guestIdNumber }));
  }
  const payload = {
    name: guest.guestName,
    phone: guest.guestPhone,
    email: guest.guestEmail || '',
    idType: guest.guestIdType || 'citizenship',
    idNumber: guest.guestIdNumber || '',
    nationality: guest.guestNationality || 'Nepal',
    address: guest.guestAddress || '',
    lastStayAt: new Date(),
  };
  if (row) {
    Object.assign(row, payload);
    if (countStay) row.stayCount = (Number(row.stayCount) || 0) + 1;
    await row.save();
    return row;
  }
  return HotelGuest.create({ ...payload, stayCount: countStay ? 1 : 0 });
}

async function searchHotelGuests(req, q) {
  const text = String(q || '').trim();
  if (text.length < 2) return [];
  const rx = new RegExp(escapeRx(text), 'i');
  return HotelGuest.find(scoped(req, {
    $or: [{ phone: rx }, { idNumber: rx }, { name: rx }],
  })).sort({ lastStayAt: -1 }).limit(20).lean();
}

module.exports = { upsertHotelGuest, searchHotelGuests, toStayGuest, escapeRx };
