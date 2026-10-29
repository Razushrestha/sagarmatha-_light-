const Room = require('../models/Room');
const Stay = require('../models/Stay');
const { scoped } = require('../utils/tenantQuery');
const { staySpan, addDaysYmd, startOfKathmandu } = require('../utils/hotelDates');

async function hotelDayReport(req, date) {
  const next = addDaysYmd(date, 1);
  const fromDate = startOfKathmandu(date);
  const untilDate = startOfKathmandu(next);
  const rooms = await Room.find(scoped(req, { isActive: true })).lean();
  const stays = await Stay.find(scoped(req, { status: { $in: ['reserved', 'checked_in', 'checked_out', 'no_show'] } }))
    .populate('room', 'number')
    .populate('folio', 'balance charges')
    .lean();
  const occupying = stays.filter((stay) => {
    const span = staySpan(stay);
    return span.start <= date && date < span.end && (stay.status === 'reserved' || stay.status === 'checked_in');
  });
  const arrivals = stays.filter((stay) => staySpan(stay).start === date);
  const departures = stays.filter((stay) => staySpan(stay).end === date && stay.status !== 'reserved');
  const Sale = require('../models/Sale');
  const sales = await Sale.find(scoped(req, {
    createdAt: { $gte: fromDate, $lt: untilDate },
    status: 'completed',
    isHeld: { $ne: true },
  })).select('total vatAmount items sku folioId').lean();
  let roomRevenue = 0;
  let roomVat = 0;
  let fbRevenue = 0;
  let fbVat = 0;
  for (const sale of sales) {
    const isRoom = (sale.items || []).some((item) => String(item.sku || '').startsWith('ROOM-'));
    if (isRoom) {
      roomRevenue += Number(sale.total) || 0;
      roomVat += Number(sale.vatAmount) || 0;
    } else if (sale.folioId) {
      fbRevenue += Number(sale.total) || 0;
      fbVat += Number(sale.vatAmount) || 0;
    }
  }
  const byStatus = rooms.reduce((acc, room) => {
    acc[room.status] = (acc[room.status] || 0) + 1;
    return acc;
  }, {});
  const inHouse = occupying.filter((s) => s.status === 'checked_in');
  return {
    date,
    rooms: {
      total: rooms.length,
      occupied: inHouse.length,
      held: occupying.filter((s) => s.status === 'reserved').length,
      vacant: rooms.filter((r) => r.status === 'vacant' || r.status === 'inspected').length,
      dirty: byStatus.dirty || 0,
      cleaning: byStatus.cleaning || 0,
      inspected: byStatus.inspected || 0,
      ooo: byStatus.ooo || 0,
    },
    arrivals: arrivals.map((s) => ({ guestName: s.guestName, room: s.room?.number, status: s.status })),
    departures: departures.map((s) => ({ guestName: s.guestName, room: s.room?.number, status: s.status })),
    inHouse: inHouse.map((s) => ({
      stay: s._id,
      guestName: s.guestName,
      room: s.room?.number,
      folioBalance: s.folio?.balance || 0,
    })),
    revenue: {
      room: Math.round(roomRevenue * 100) / 100,
      roomVat: Math.round(roomVat * 100) / 100,
      fb: Math.round(fbRevenue * 100) / 100,
      fbVat: Math.round(fbVat * 100) / 100,
    },
  };
}

module.exports = { hotelDayReport };
