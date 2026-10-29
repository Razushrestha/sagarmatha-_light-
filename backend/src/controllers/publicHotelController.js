const Tenant = require('../models/Tenant');
const Settings = require('../models/Settings');
const Room = require('../models/Room');
const ChannelReservation = require('../models/ChannelReservation');
const { runWithTenant } = require('../utils/tenantContext');
const { parseYmd, addDaysYmd, startOfKathmandu } = require('../utils/hotelDates');
const { MEAL_PLANS, normalizeMealPlan } = require('../utils/hotelMeals');
const { isEmail } = require('../utils/mailer');

async function hotelTenant(slug) {
  const tenant = await Tenant.findOne({ slug: String(slug || '').toLowerCase().trim(), status: { $in: ['trial', 'active'] } });
  if (!tenant) return null;
  if (tenant.industry !== 'hotel' && tenant.modules?.rooms !== true) return null;
  return tenant;
}

exports.hotelWidget = async (req, res) => {
  try {
    const tenant = await hotelTenant(req.params.slug);
    if (!tenant) return res.status(404).json({ success: false, message: 'Hotel not found.' });
    const data = await runWithTenant(tenant._id, async () => {
      const settings = await Settings.findOne().select('companyName address phone').lean();
      const rooms = await Room.find({ isActive: true }).select('type rate status').lean();
      const types = {};
      for (const room of rooms) {
        const key = room.type || 'Standard';
        if (!types[key]) types[key] = { type: key, rate: room.rate, vacant: 0, total: 0 };
        types[key].total += 1;
        types[key].rate = Math.min(types[key].rate, Number(room.rate) || 0);
        if (room.status === 'vacant' || room.status === 'inspected') types[key].vacant += 1;
      }
      return {
        name: settings?.companyName || tenant.name,
        slug: tenant.slug,
        address: settings?.address || '',
        phone: settings?.phone || '',
        types: Object.values(types),
        meals: Object.values(MEAL_PLANS),
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.hotelBook = async (req, res) => {
  try {
    const tenant = await hotelTenant(req.params.slug);
    if (!tenant) return res.status(404).json({ success: false, message: 'Hotel not found.' });
    const guestName = String(req.body.guestName || '').trim();
    const guestPhone = String(req.body.guestPhone || '').trim();
    const guestEmail = String(req.body.guestEmail || '').trim();
    const start = parseYmd(req.body.checkIn);
    const nights = Math.max(1, Number(req.body.nights) || 0);
    const end = parseYmd(req.body.checkOut) || (start && nights ? addDaysYmd(start, nights) : '');
    if (!guestName || !guestPhone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required.' });
    }
    if (guestEmail && !isEmail(guestEmail)) {
      return res.status(400).json({ success: false, message: 'Email is not valid.' });
    }
    if (!start || !end || end <= start) {
      return res.status(400).json({ success: false, message: 'Check-in and check-out dates are required.' });
    }
    const row = await runWithTenant(tenant._id, async () => ChannelReservation.create({
      channel: 'Website',
      guestName,
      guestPhone,
      guestEmail: guestEmail || undefined,
      roomType: String(req.body.roomType || '').trim(),
      checkIn: startOfKathmandu(start),
      checkOut: startOfKathmandu(end),
      notes: [req.body.notes, req.body.mealPlan ? `Meal ${normalizeMealPlan(req.body.mealPlan)}` : '']
        .filter(Boolean)
        .join(' · '),
      status: 'pending',
    }));
    res.status(201).json({
      success: true,
      message: 'Request received. The hotel will confirm the room.',
      data: { id: row._id, checkIn: start, checkOut: end },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
