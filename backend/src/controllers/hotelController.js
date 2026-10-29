const Room = require('../models/Room');
const Stay = require('../models/Stay');
const Folio = require('../models/Folio');
const ChannelReservation = require('../models/ChannelReservation');
const { scoped } = require('../utils/tenantQuery');
const { postJournal, ACCOUNT_CODES } = require('../services/journalService');
const {
  kathmanduYmd,
  todayYmd,
  addDaysYmd,
  startOfKathmandu,
  parseYmd,
  staySpan,
  overlapsRange,
  HOLD_STATUSES,
} = require('../utils/hotelDates');
const { parseGuest, guestGaps, applyGuest, mergeGuest, toStayGuest } = require('../utils/hotelGuest');
const { issueRoomInvoice, issueMealInvoice, issueStayFee, creditStayNights } = require('../services/roomInvoiceService');
const { unusedNights, defaultCancelFeeNights, lateNightly } = require('../utils/hotelStayFees');
const { upsertHotelGuest, searchHotelGuests } = require('../services/hotelGuestService');
const { normalizeMealPlan, mealExtraPerNight, mealLabel } = require('../utils/hotelMeals');
const NightAudit = require('../models/NightAudit');
const HotelRatePlan = require('../models/HotelRatePlan');
const { quotedRate, planFitsRoom, RATE_KINDS } = require('../utils/hotelRates');
const { hotelDayReport } = require('../services/hotelDayService');
const {
  defaultBucket,
  isValidBucket,
  normalizeSplitMode,
  windowTotals,
  assignExistingBuckets,
} = require('../utils/folioBuckets');
const { nextHotelDate, canCloseDate, closeBlockedReason } = require('../utils/hotelAudit');
const { cityLedgerAmount, creditCapOk } = require('../utils/cityLedger');
const Customer = require('../models/Customer');
const CustomerPayment = require('../models/CustomerPayment');
const Sale = require('../models/Sale');
const { reconcileCustomerOutstanding } = require('../utils/salePayments');

async function findHoldConflict(req, roomId, start, end, excludeId) {
  const filter = scoped(req, { room: roomId, status: { $in: HOLD_STATUSES } });
  if (excludeId) filter._id = { $ne: excludeId };
  const rows = await Stay.find(filter).lean();
  return rows.find((row) => overlapsRange(staySpan(row), start, end)) || null;
}

function conflictMessage(stay) {
  const span = staySpan(stay);
  return `Room is held for ${stay.guestName} (${span.start} → ${span.end}).`;
}

async function openFolio(stay, req) {
  if (stay.folio) {
    const existing = await Folio.findById(stay.folio);
    if (existing) return existing;
  }
  const folio = await Folio.create({
    stay: stay._id,
    guestName: stay.guestName,
    customer: stay.customer,
    status: 'open',
    balance: 0,
  });
  stay.folio = folio._id;
  await stay.save();
  return folio;
}

async function chargeRoomStay(req, stay, room, folio, extras = {}) {
  await issueRoomInvoice(req, stay, room, folio, extras);
  await issueMealInvoice(req, stay, folio, {
    nights: extras.nights,
    rate: stay.mealRate,
    label: mealLabel(stay.mealPlan),
  });
}

function toRackStay(stay) {
  const span = staySpan(stay);
  const room = stay.room && typeof stay.room === 'object' ? stay.room : null;
  return {
    stayId: stay._id,
    roomId: String(room?._id || stay.room || ''),
    roomNumber: room?.number || '',
    guestName: stay.guestName,
    guestPhone: stay.guestPhone || '',
    guestIdType: stay.guestIdType || 'citizenship',
    guestIdNumber: stay.guestIdNumber || '',
    guestNationality: stay.guestNationality || '',
    guestAddress: stay.guestAddress || '',
    status: stay.status,
    start: span.start,
    end: span.end,
    nights: stay.nights,
    folioId: stay.folio?._id || null,
    folioBalance: stay.folio?.balance || 0,
  };
}

exports.listRooms = async (req, res) => {
  try {
    const data = await Room.find(scoped(req, { isActive: true })).populate('assignedTo', 'name role').sort({ number: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRoom = async (req, res) => {
  try {
    const payload = {
      number: String(req.body.number || '').trim(),
      type: req.body.type || 'Standard',
      rate: Number(req.body.rate) || 0,
      notes: req.body.notes,
    };
    if (!payload.number) return res.status(400).json({ success: false, message: 'Room number is required.' });
    let room;
    if (req.params.id) {
      room = await Room.findOneAndUpdate(scoped(req, { _id: req.params.id }), payload, { new: true });
      if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });
    } else {
      room = await Room.create(payload);
    }
    res.json({ success: true, data: room });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'That room already exists.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.setRoomStatus = async (req, res) => {
  try {
    const status = req.body.status;
    if (!['vacant', 'occupied', 'dirty', 'cleaning', 'inspected', 'ooo'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid room status.' });
    }
    const room = await Room.findOne(scoped(req, { _id: req.params.id }));
    if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });
    if (room.status === 'occupied' && status === 'ooo') {
      return res.status(400).json({ success: false, message: 'Check the guest out before marking the room out of order.' });
    }
    room.status = status;
    if (req.body.assignedTo !== undefined) room.assignedTo = req.body.assignedTo || null;
    if (req.body.notes !== undefined) room.notes = req.body.notes;
    await room.save();
    res.json({ success: true, data: room });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listStays = async (req, res) => {
  try {
    const filter = scoped(req);
    if (req.query.status) filter.status = req.query.status;
    const rows = await Stay.find(filter)
      .populate('room', 'number type status')
      .populate('folio', 'balance status')
      .populate('roomSale', 'invoiceNumber total vatAmount irdStatus')
      .populate('ratePlan', 'name kind mode')
      .populate('customer', 'name company')
      .sort({ checkIn: -1 })
      .limit(100)
      .lean();
    const data = rows.map((stay) => {
      const span = staySpan(stay);
      return { ...stay, occupyStart: span.start, occupyEnd: span.end };
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRack = async (req, res) => {
  try {
    const days = Math.min(31, Math.max(7, parseInt(req.query.days, 10) || 14));
    const from = parseYmd(req.query.from) || todayYmd();
    const rangeEnd = addDaysYmd(from, days);
    const dates = Array.from({ length: days }, (_, i) => addDaysYmd(from, i));
    const fromDate = startOfKathmandu(from);
    const untilDate = startOfKathmandu(rangeEnd);

    const rooms = await Room.find(scoped(req, { isActive: true })).sort({ number: 1 }).lean();
    const stayRows = await Stay.find(scoped(req, {
      status: { $in: ['reserved', 'checked_in', 'checked_out'] },
      $or: [
        { status: { $in: ['reserved', 'checked_in'] } },
        { checkIn: { $lt: untilDate }, checkOut: { $gte: fromDate } },
      ],
    }))
      .populate('room', 'number type status')
      .populate('folio', 'balance status')
      .populate('roomSale', 'invoiceNumber total vatAmount irdStatus')
      .lean();

    const stays = stayRows.map(toRackStay).filter((stay) => overlapsRange(stay, from, rangeEnd));

    const pendingRows = await ChannelReservation.find(scoped(req, {
      status: 'pending',
      checkIn: { $lt: untilDate },
      checkOut: { $gte: fromDate },
    })).sort({ checkIn: 1 }).lean();

    const pending = pendingRows.map((row) => ({
      _id: row._id,
      channel: row.channel,
      guestName: row.guestName,
      roomType: row.roomType || '',
      start: kathmanduYmd(row.checkIn),
      end: kathmanduYmd(row.checkOut),
    }));

    const arrivals = [
      ...stays.filter((stay) => stay.start >= from && stay.start < rangeEnd).map((stay) => ({
        kind: 'stay',
        date: stay.start,
        guestName: stay.guestName,
        roomNumber: stay.roomNumber,
        stayId: stay.stayId,
        status: stay.status,
      })),
      ...pending.filter((row) => row.start >= from && row.start < rangeEnd).map((row) => ({
        kind: 'channel',
        date: row.start,
        guestName: row.guestName,
        roomNumber: '',
        channel: row.channel,
        status: 'pending',
      })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.guestName.localeCompare(b.guestName));

    const departures = stays
      .filter((stay) => stay.end >= from && stay.end < rangeEnd)
      .map((stay) => ({
        kind: 'stay',
        date: stay.end,
        guestName: stay.guestName,
        roomNumber: stay.roomNumber,
        stayId: stay.stayId,
        status: stay.status,
        folioBalance: stay.folioBalance,
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.guestName.localeCompare(b.guestName));

    res.json({
      success: true,
      data: { today: todayYmd(), from, days, dates, rooms, stays, arrivals, departures, pending },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function priceStay(req, room, body) {
  let plan = null;
  if (body.ratePlanId) {
    plan = await HotelRatePlan.findOne(scoped(req, { _id: body.ratePlanId, isActive: true })).lean();
    if (!plan) return { error: { status: 404, message: 'Rate plan not found.' } };
    if (!planFitsRoom(plan, room)) {
      return { error: { status: 400, message: `${plan.name} is for ${plan.roomType} rooms.` } };
    }
  }
  const override = body.rate != null && body.rate !== '' ? Number(body.rate) : undefined;
  return {
    rate: quotedRate({ rack: room.rate, plan, override: Number.isFinite(override) ? override : undefined }),
    plan,
  };
}

async function persistStay(req, { status, occupyNow }) {
  const room = await Room.findOne(scoped(req, { _id: req.body.roomId, isActive: true }));
  if (!room) return { error: { status: 404, message: 'Room not found.' } };
  if (room.status === 'ooo') {
    return { error: { status: 400, message: 'Room is out of order.' } };
  }
  if (occupyNow && room.status === 'occupied') {
    return { error: { status: 400, message: 'Room is occupied.' } };
  }
  const priced = await priceStay(req, room, req.body);
  if (priced.error) return priced;
  const guest = parseGuest(req.body);
  const missing = guestGaps(guest, { requireId: occupyNow });
  if (missing.length) {
    return { error: { status: 400, message: `Guest ${missing.join(', ')} required.` } };
  }
  const nights = Math.max(1, Number(req.body.nights) || 1);
  const start = parseYmd(req.body.checkIn) || todayYmd();
  const end = addDaysYmd(start, nights);
  const conflict = await findHoldConflict(req, room._id, start, end);
  if (conflict) return { error: { status: 400, message: conflictMessage(conflict) } };
  const stay = await Stay.create({
    room: room._id,
    customer: req.body.customer || priced.plan?.customer,
    ...guest,
    nights,
    rate: priced.rate,
    ratePlan: priced.plan?._id,
    rateKind: priced.plan?.kind || 'rack',
    mealPlan: normalizeMealPlan(req.body.mealPlan),
    mealRate: mealExtraPerNight(req.body.mealPlan, req.body.mealRate),
    checkIn: startOfKathmandu(start),
    status,
    channel: req.body.channel,
    notes: req.body.notes,
    arrivedAt: occupyNow ? new Date() : undefined,
    createdBy: req.user._id,
  });
  if (req.body.channelReservationId) {
    await ChannelReservation.findOneAndUpdate(
      scoped(req, { _id: req.body.channelReservationId }),
      { status: 'imported', stay: stay._id }
    );
  }
  const profile = await upsertHotelGuest(req, guest, { countStay: true });
  if (profile) stay.guestProfile = profile._id;
  await stay.save();
  const folio = await openFolio(stay, req);
  if (occupyNow) {
    room.status = 'occupied';
    room.stay = stay._id;
    await room.save();
    await chargeRoomStay(req, stay, room, folio);
  }
  const data = await Stay.findById(stay._id).populate('room', 'number type').populate('folio').lean();
  return { data };
}

exports.reserve = async (req, res) => {
  try {
    const start = parseYmd(req.body.checkIn);
    if (!start) return res.status(400).json({ success: false, message: 'Expected check-in date is required.' });
    const result = await persistStay(req, { status: 'reserved', occupyNow: false });
    if (result.error) return res.status(result.error.status).json({ success: false, message: result.error.message });
    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkIn = async (req, res) => {
  try {
    const result = await persistStay(req, { status: 'checked_in', occupyNow: true });
    if (result.error) return res.status(result.error.status).json({ success: false, message: result.error.message });
    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.arrive = async (req, res) => {
  try {
    const stay = await Stay.findOne(scoped(req, { _id: req.params.id, status: 'reserved' }));
    if (!stay) return res.status(404).json({ success: false, message: 'Reservation not found.' });
    const room = await Room.findOne(scoped(req, { _id: stay.room, isActive: true }));
    if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });
    if (room.status === 'occupied') {
      return res.status(400).json({ success: false, message: 'Room is occupied. Check out the current guest first.' });
    }
    if (room.status === 'ooo') {
      return res.status(400).json({ success: false, message: 'Room is out of order.' });
    }
    const guest = mergeGuest(stay, req.body);
    const missing = guestGaps(guest, { requireId: true });
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Complete guest record first: ${missing.join(', ')}.` });
    }
    applyGuest(stay, guest);
    const profile = await upsertHotelGuest(req, guest, { countStay: stay.guestProfile ? false : true });
    if (profile) stay.guestProfile = profile._id;
    const folio = await openFolio(stay, req);
    stay.status = 'checked_in';
    stay.arrivedAt = new Date();
    await stay.save();
    room.status = 'occupied';
    room.stay = stay._id;
    await room.save();
    await chargeRoomStay(req, stay, room, folio);
    const data = await Stay.findById(stay._id).populate('room', 'number type').populate('folio').lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cancelStay = async (req, res) => {
  try {
    const stay = await Stay.findOne(scoped(req, { _id: req.params.id, status: 'reserved' }));
    if (!stay) return res.status(404).json({ success: false, message: 'Reservation not found.' });
    const span = staySpan(stay);
    const feeNights = req.body.feeNights != null
      ? Math.max(0, Number(req.body.feeNights) || 0)
      : defaultCancelFeeNights(span.start, todayYmd());
    if (feeNights > 0 || Number(req.body.amount) > 0) {
      const folio = await openFolio(stay, req);
      await issueStayFee(req, stay, folio, {
        sku: 'FEE-CANCEL',
        description: `Cancellation fee · ${stay.guestName}`,
        nights: feeNights || 1,
        amount: req.body.amount,
        rate: stay.rate,
      });
    }
    stay.status = 'cancelled';
    stay.cancelledAt = new Date();
    stay.notes = [stay.notes, req.body.notes].filter(Boolean).join(' ').trim() || stay.notes;
    await stay.save();
    const data = await Stay.findById(stay._id).populate('folio').lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.noShow = async (req, res) => {
  try {
    const stay = await Stay.findOne(scoped(req, { _id: req.params.id, status: 'reserved' }));
    if (!stay) return res.status(404).json({ success: false, message: 'Reservation not found.' });
    const start = staySpan(stay).start;
    if (start > todayYmd()) {
      return res.status(400).json({ success: false, message: 'No-show is only after the expected check-in date. Cancel instead.' });
    }
    const skipFee = req.body.feeNights === 0 || req.body.amount === 0;
    if (!skipFee) {
      const folio = await openFolio(stay, req);
      await issueStayFee(req, stay, folio, {
        sku: 'FEE-NOSHOW',
        description: `No-show fee · ${stay.guestName}`,
        nights: req.body.feeNights != null ? Number(req.body.feeNights) : 1,
        amount: req.body.amount,
        rate: stay.rate,
      });
    }
    stay.status = 'no_show';
    stay.noShowAt = new Date();
    await stay.save();
    const data = await Stay.findById(stay._id).populate('folio').lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateGuest = async (req, res) => {
  try {
    const stay = await Stay.findOne(scoped(req, {
      _id: req.params.id,
      status: { $in: ['reserved', 'checked_in'] },
    }));
    if (!stay) return res.status(404).json({ success: false, message: 'Stay not found.' });
    const guest = mergeGuest(stay, req.body);
    const occupyNow = stay.status === 'checked_in';
    const missing = guestGaps(guest, { requireId: occupyNow });
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Guest ${missing.join(', ')} required.` });
    }
    applyGuest(stay, guest);
    const profile = await upsertHotelGuest(req, guest);
    if (profile) stay.guestProfile = profile._id;
    if (req.body.secondGuestName !== undefined) stay.secondGuestName = String(req.body.secondGuestName || '').trim();
    if (req.body.secondGuestPhone !== undefined) stay.secondGuestPhone = String(req.body.secondGuestPhone || '').trim();
    await stay.save();
    if (stay.folio) {
      await Folio.updateOne(scoped(req, { _id: stay.folio }), {
        guestName: stay.guestName,
        guestBName: stay.secondGuestName,
        guestBPhone: stay.secondGuestPhone,
      });
    }
    const data = await Stay.findById(stay._id).populate('room', 'number type').populate('folio').lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkOut = async (req, res) => {
  try {
    const stay = await Stay.findOne(scoped(req, { _id: req.params.id, status: 'checked_in' })).populate('folio');
    if (!stay) return res.status(404).json({ success: false, message: 'Stay not found.' });
    const span = staySpan(stay);
    const today = todayYmd();
    let folio = stay.folio;
    const lateRate = lateNightly(stay.rate, req.body.late);
    if (lateRate > 0) {
      folio = await openFolio(stay, req);
      await issueStayFee(req, stay, folio, {
        sku: 'FEE-LATE',
        description: `Late checkout · Room fee`,
        amount: lateRate,
      });
      folio = await Folio.findById(folio._id);
    }
    const unused = unusedNights(span, today);
    if (req.body.creditUnused !== false && unused > 0) {
      folio = await openFolio(stay, req);
      await creditStayNights(req, stay, folio, {
        nights: unused,
        rate: stay.rate,
        description: `Unused room ${unused} night${unused === 1 ? '' : 's'}`,
      });
      if (Number(stay.mealRate) > 0) {
        await creditStayNights(req, stay, folio, {
          nights: unused,
          rate: stay.mealRate,
          description: `Unused meals ${unused} night${unused === 1 ? '' : 's'}`,
        });
      }
      stay.nights = Math.max(1, (Number(stay.nights) || 1) - unused);
      folio = await Folio.findById(folio._id);
    }
    await stay.save();
    if (folio && Number(folio.balance) > 0 && req.body.force !== true) {
      return res.status(400).json({
        success: false,
        message: `Folio still has ${folio.balance} due. Collect cash, transfer to city ledger, or settle.`,
        data: { balance: folio.balance, folioId: folio._id },
      });
    }
    stay.status = 'checked_out';
    stay.checkOut = new Date();
    await stay.save();
    if (folio) {
      folio.status = 'closed';
      folio.closedAt = new Date();
      await folio.save();
    }
    const room = await Room.findById(stay.room);
    if (room) {
      room.status = 'dirty';
      room.stay = null;
      await room.save();
    }
    res.json({ success: true, data: stay });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

function folioLineLabel(source, kind) {
  if (kind === 'city_ledger') return 'City ledger';
  if (kind === 'credit') return 'Credit';
  if (kind === 'deposit') return 'Deposit';
  if (kind === 'payment') return 'Payment';
  if (source === 'room') return 'Room';
  if (source === 'cafe_ticket') return 'F&B';
  if (source === 'shop_sale' || source === 'mix') return 'POS';
  return source || 'Charge';
}

function presentFolio(folio) {
  const mode = normalizeSplitMode(folio.splitMode);
  const charges = (folio.charges || []).map((row) => ({
    ...row,
    bucket: row.bucket || defaultBucket(mode, row.source, row.kind),
    label: folioLineLabel(row.source, row.kind),
  }));
  const charged = charges.reduce((s, row) => s + (Number(row.amount) || 0), 0);
  const paid = charges.reduce((s, row) => s + (Number(row.paid) || 0), 0);
  return {
    ...folio,
    splitMode: mode,
    charges,
    charged: Math.round(charged * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    windows: windowTotals(charges, mode, folio),
  };
}

async function postFolioCash(req, folio, { amount, kind, description, method, bucket }) {
  await postJournal({
    description,
    reference: `FOLIO-${folio._id.toString().slice(-6)}`,
    referenceId: folio._id,
    folioId: folio._id,
    source: 'room',
    lines: [
      { code: ACCOUNT_CODES.CASH, debit: amount },
      { code: ACCOUNT_CODES.RECEIVABLE, credit: amount },
    ],
    userId: req.user._id,
  });
  folio.balance = Math.round((Number(folio.balance) - amount) * 100) / 100;
  const mode = normalizeSplitMode(folio.splitMode);
  const lineBucket = isValidBucket(mode, bucket) ? bucket : defaultBucket(mode, 'room', kind);
  folio.charges.push({
    description,
    source: 'room',
    kind,
    method: method || 'cash',
    bucket: lineBucket,
    amount: 0,
    paid: amount,
    at: new Date(),
  });
  await folio.save();
  return folio;
}

exports.getFolio = async (req, res) => {
  try {
    const folio = await Folio.findOne(scoped(req, { _id: req.params.id }))
      .populate('stay', 'guestName guestPhone guestAddress room nights rate status occupyStart')
      .populate('charges.sale', 'invoiceNumber total vatAmount')
      .populate('customer', 'name company phone outstanding creditLimit')
      .lean();
    if (!folio) return res.status(404).json({ success: false, message: 'Folio not found.' });
    const stay = await Stay.findById(folio.stay).populate('room', 'number type').populate('customer', 'name company').lean();
    res.json({ success: true, data: { ...presentFolio(folio), stay } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.emailFolio = async (req, res) => {
  try {
    const { smtpConfigured, isEmail, sendMail } = require('../utils/mailer');
    const { formatFolioEmail } = require('../utils/folioEmail');
    const folio = await Folio.findOne(scoped(req, { _id: req.params.id }))
      .populate('charges.sale', 'invoiceNumber total vatAmount')
      .lean();
    if (!folio) return res.status(404).json({ success: false, message: 'Folio not found.' });
    const stay = await Stay.findById(folio.stay).populate('room', 'number type').lean();
    const presented = presentFolio({ ...folio, stay });
    const to = String(req.body.to || stay?.guestEmail || '').trim();
    if (!isEmail(to)) return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    if (!smtpConfigured()) {
      return res.status(503).json({ success: false, message: 'SMTP is not configured on this server. Use Print or the mail app, or set SMTP_HOST.' });
    }
    const Settings = require('../models/Settings');
    const shop = await Settings.findOne().select('companyName address vatNumber email').lean();
    const mail = formatFolioEmail(presented, shop || {}, req.body.window || '');
    await sendMail({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      from: shop?.email || undefined,
    });
    if (stay && !stay.guestEmail) {
      stay.guestEmail = to;
      await Stay.updateOne(scoped(req, { _id: stay._id }), { guestEmail: to });
    }
    res.json({ success: true, message: `Folio sent to ${to}` });
  } catch (error) {
    if (error.code === 'SMTP_MISSING') {
      return res.status(503).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.settleFolio = async (req, res) => {
  try {
    const folio = await Folio.findOne(scoped(req, { _id: req.params.id, status: 'open' }));
    if (!folio) return res.status(404).json({ success: false, message: 'Open folio not found.' });
    const amount = Number(req.body.amount);
    if (!(amount > 0)) return res.status(400).json({ success: false, message: 'Amount is required.' });
    await postFolioCash(req, folio, {
      amount,
      kind: 'payment',
      description: req.body.description || 'Payment',
      method: req.body.method,
      bucket: req.body.bucket,
    });
    res.json({ success: true, data: presentFolio(folio.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cityLedgerFolio = async (req, res) => {
  try {
    const folio = await Folio.findOne(scoped(req, { _id: req.params.id, status: 'open' }));
    if (!folio) return res.status(404).json({ success: false, message: 'Open folio not found.' });
    const amount = cityLedgerAmount(folio.balance, req.body.amount);
    if (!(amount > 0)) return res.status(400).json({ success: false, message: 'Nothing due to transfer to city ledger.' });
    const customerId = req.body.customerId || folio.customer;
    const customer = await Customer.findOne(scoped(req, { _id: customerId, isActive: true }));
    if (!customer) return res.status(400).json({ success: false, message: 'Pick a company or travel agent to bill.' });
    await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customer._id);
    const fresh = await Customer.findById(customer._id);
    if (!creditCapOk(fresh, amount)) {
      return res.status(400).json({
        success: false,
        message: `Credit limit ${fresh.creditLimit} exceeded (already due ${fresh.outstanding}).`,
      });
    }
    folio.customer = customer._id;
    await Sale.updateMany(
      scoped(req, { folioId: folio._id }),
      { customer: customer._id, customerName: customer.name, customerPhone: customer.phone }
    );
    if (folio.stay) await Stay.updateOne(scoped(req, { _id: folio.stay }), { customer: customer._id });
    const mode = normalizeSplitMode(folio.splitMode);
    const lineBucket = isValidBucket(mode, req.body.bucket) ? req.body.bucket : defaultBucket(mode, 'room', 'city_ledger');
    folio.balance = Math.round((Number(folio.balance) - amount) * 100) / 100;
    folio.charges.push({
      description: req.body.description || `City ledger · ${customer.company || customer.name}`,
      source: 'room',
      kind: 'city_ledger',
      method: 'credit',
      bucket: lineBucket,
      amount: 0,
      paid: amount,
      at: new Date(),
    });
    await folio.save();
    await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customer._id);
    const presented = presentFolio(folio.toObject());
    res.json({ success: true, data: { ...presented, customer: { _id: customer._id, name: customer.name, company: customer.company } } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.depositFolio = async (req, res) => {
  try {
    const folio = await Folio.findOne(scoped(req, { _id: req.params.id, status: 'open' }));
    if (!folio) return res.status(404).json({ success: false, message: 'Open folio not found.' });
    const amount = Number(req.body.amount);
    if (!(amount > 0)) return res.status(400).json({ success: false, message: 'Deposit amount is required.' });
    await postFolioCash(req, folio, {
      amount,
      kind: 'deposit',
      description: req.body.description || 'Advance / deposit',
      method: req.body.method,
      bucket: req.body.bucket,
    });
    res.json({ success: true, data: presentFolio(folio.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listChannel = async (req, res) => {
  try {
    const data = await ChannelReservation.find(scoped(req)).sort({ checkIn: 1 }).limit(100).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createChannel = async (req, res) => {
  try {
    const row = await ChannelReservation.create({
      channel: req.body.channel || 'Booking.com',
      confirmation: req.body.confirmation,
      guestName: req.body.guestName,
      guestPhone: req.body.guestPhone,
      roomType: req.body.roomType,
      checkIn: req.body.checkIn,
      checkOut: req.body.checkOut,
      notes: req.body.notes,
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.importChannel = async (req, res) => {
  try {
    const row = await ChannelReservation.findOne(scoped(req, { _id: req.params.id, status: 'pending' }));
    if (!row) return res.status(404).json({ success: false, message: 'Pending reservation not found.' });
    if (!req.body.roomId) return res.status(400).json({ success: false, message: 'Pick a room to import into.' });
    req.body.guestName = row.guestName;
    req.body.guestPhone = row.guestPhone;
    req.body.guestEmail = row.guestEmail;
    req.body.channel = row.channel;
    req.body.checkIn = kathmanduYmd(row.checkIn);
    req.body.nights = Math.max(1, Math.round((new Date(row.checkOut) - new Date(row.checkIn)) / 86400000) || 1);
    req.body.channelReservationId = row._id;
    return exports.reserve(req, res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.extendStay = async (req, res) => {
  try {
    const stay = await Stay.findOne(scoped(req, { _id: req.params.id, status: { $in: ['reserved', 'checked_in'] } }));
    if (!stay) return res.status(404).json({ success: false, message: 'Stay not found.' });
    const extra = Math.max(1, Number(req.body.nights) || 0);
    const span = staySpan(stay);
    const conflict = await findHoldConflict(req, stay.room, span.end, addDaysYmd(span.end, extra), stay._id);
    if (conflict) return res.status(400).json({ success: false, message: conflictMessage(conflict) });
    stay.nights = (Number(stay.nights) || 1) + extra;
    await stay.save();
    if (stay.status === 'checked_in') {
      const room = await Room.findById(stay.room);
      const folio = await openFolio(stay, req);
      await chargeRoomStay(req, stay, room, folio, {
        nights: extra,
        description: `Room ${room.number} extra ${extra} night${extra === 1 ? '' : 's'}`,
      });
    }
    const data = await Stay.findById(stay._id).populate('room', 'number type').populate('folio').populate('roomSale', 'invoiceNumber total vatAmount').lean();
    res.json({ success: true, data: { ...data, ...staySpan(data) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.moveStay = async (req, res) => {
  try {
    const stay = await Stay.findOne(scoped(req, { _id: req.params.id, status: { $in: ['reserved', 'checked_in'] } }));
    if (!stay) return res.status(404).json({ success: false, message: 'Stay not found.' });
    const nextRoom = await Room.findOne(scoped(req, { _id: req.body.roomId, isActive: true }));
    if (!nextRoom) return res.status(404).json({ success: false, message: 'Room not found.' });
    if (String(nextRoom._id) === String(stay.room)) {
      return res.status(400).json({ success: false, message: 'Guest is already in that room.' });
    }
    if (nextRoom.status === 'ooo') return res.status(400).json({ success: false, message: 'Room is out of order.' });
    if (nextRoom.status === 'occupied') return res.status(400).json({ success: false, message: 'Room is occupied.' });
    const span = staySpan(stay);
    const conflict = await findHoldConflict(req, nextRoom._id, span.start, span.end, stay._id);
    if (conflict) return res.status(400).json({ success: false, message: conflictMessage(conflict) });
    const previous = await Room.findById(stay.room);
    stay.room = nextRoom._id;
    if (req.body.useNewRate) {
      const plan = stay.ratePlan ? await HotelRatePlan.findById(stay.ratePlan).lean() : null;
      stay.rate = quotedRate({ rack: nextRoom.rate, plan: planFitsRoom(plan, nextRoom) ? plan : null });
    }
    await stay.save();
    if (stay.status === 'checked_in') {
      if (previous) {
        previous.status = 'dirty';
        previous.stay = null;
        await previous.save();
      }
      nextRoom.status = 'occupied';
      nextRoom.stay = stay._id;
      await nextRoom.save();
    }
    const data = await Stay.findById(stay._id).populate('room', 'number type rate').populate('folio').lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.changeRate = async (req, res) => {
  try {
    const stay = await Stay.findOne(scoped(req, { _id: req.params.id, status: { $in: ['reserved', 'checked_in'] } }));
    if (!stay) return res.status(404).json({ success: false, message: 'Stay not found.' });
    const nextRate = Number(req.body.rate);
    if (!(nextRate >= 0)) return res.status(400).json({ success: false, message: 'Rate is required.' });
    const previous = Number(stay.rate) || 0;
    stay.rate = nextRate;
    await stay.save();
    const delta = Math.round((nextRate - previous) * 100) / 100;
    if (stay.status === 'checked_in' && delta > 0) {
      const span = staySpan(stay);
      const today = todayYmd();
      let remaining = 0;
      for (let day = today < span.start ? span.start : today; day < span.end; day = addDaysYmd(day, 1)) remaining += 1;
      remaining = Math.max(1, remaining);
      const room = await Room.findById(stay.room);
      const folio = await openFolio(stay, req);
      await issueRoomInvoice(req, stay, room, folio, {
        nights: remaining,
        rate: delta,
        description: `Room ${room.number} rate change NPR ${delta}/night × ${remaining}`,
      });
    }
    const data = await Stay.findById(stay._id).populate('room', 'number type').populate('folio').populate('roomSale', 'invoiceNumber total vatAmount').lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.dailyReport = async (req, res) => {
  try {
    const date = parseYmd(req.query.date) || todayYmd();
    const data = await hotelDayReport(req, date);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.splitFolio = async (req, res) => {
  try {
    const folio = await Folio.findOne(scoped(req, { _id: req.params.id, status: 'open' }));
    if (!folio) return res.status(404).json({ success: false, message: 'Open folio not found.' });
    const mode = normalizeSplitMode(req.body.splitMode);
    folio.splitMode = mode;
    if (req.body.guestBName !== undefined) folio.guestBName = String(req.body.guestBName || '').trim();
    if (req.body.guestBPhone !== undefined) folio.guestBPhone = String(req.body.guestBPhone || '').trim();
    assignExistingBuckets(folio);
    await folio.save();
    if (folio.stay && (folio.guestBName || folio.guestBPhone)) {
      await Stay.updateOne(scoped(req, { _id: folio.stay }), {
        secondGuestName: folio.guestBName,
        secondGuestPhone: folio.guestBPhone,
      });
    }
    const fresh = await Folio.findById(folio._id).populate('charges.sale', 'invoiceNumber total vatAmount').lean();
    const stay = await Stay.findById(folio.stay).populate('room', 'number type').lean();
    res.json({ success: true, data: { ...presentFolio(fresh), stay } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.moveFolioCharge = async (req, res) => {
  try {
    const folio = await Folio.findOne(scoped(req, { _id: req.params.id, status: 'open' }));
    if (!folio) return res.status(404).json({ success: false, message: 'Open folio not found.' });
    const mode = normalizeSplitMode(folio.splitMode);
    if (mode === 'none') return res.status(400).json({ success: false, message: 'Split the folio first.' });
    if (!isValidBucket(mode, req.body.bucket)) {
      return res.status(400).json({ success: false, message: 'Pick room, extras, or a guest window.' });
    }
    const line = folio.charges.id(req.body.chargeId);
    if (!line) return res.status(404).json({ success: false, message: 'Line not found.' });
    line.bucket = req.body.bucket;
    await folio.save();
    const fresh = await Folio.findById(folio._id).populate('charges.sale', 'invoiceNumber total vatAmount').lean();
    const stay = await Stay.findById(folio.stay).populate('room', 'number type').lean();
    res.json({ success: true, data: { ...presentFolio(fresh), stay } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function lastClosedAudit(req) {
  return NightAudit.findOne(scoped(req, { status: 'closed' })).sort({ date: -1, closedAt: -1 }).lean();
}

exports.listAudits = async (req, res) => {
  try {
    const today = todayYmd();
    const last = await lastClosedAudit(req);
    const hotelDate = nextHotelDate(last?.date, today);
    const rows = await NightAudit.find(scoped(req)).sort({ date: -1 }).limit(31)
      .populate('closedBy', 'name')
      .lean();
    const preview = await hotelDayReport(req, hotelDate <= today ? hotelDate : today);
    res.json({
      success: true,
      data: {
        today,
        hotelDate,
        lastClosed: last?.date || null,
        canClose: canCloseDate(hotelDate, last?.date, today),
        preview,
        history: rows,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.closeNight = async (req, res) => {
  try {
    const today = todayYmd();
    const last = await lastClosedAudit(req);
    const date = parseYmd(req.body.date) || nextHotelDate(last?.date, today);
    const blocked = closeBlockedReason(date, last?.date, today);
    if (blocked) return res.status(400).json({ success: false, message: blocked });
    const existing = await NightAudit.findOne(scoped(req, { date, status: 'closed' }));
    if (existing) return res.status(400).json({ success: false, message: 'That hotel date is already closed.' });

    const reserved = await Stay.find(scoped(req, { status: 'reserved' })).populate('room', 'number');
    const noShows = [];
    for (const stay of reserved) {
      if (staySpan(stay).start > date) continue;
      stay.status = 'no_show';
      stay.noShowAt = new Date();
      await stay.save();
      noShows.push({ stay: stay._id, guestName: stay.guestName, room: stay.room?.number });
    }

    const snapshot = await hotelDayReport(req, date);
    const row = await NightAudit.create({
      date,
      status: 'closed',
      snapshot,
      noShows,
      inHouse: snapshot.inHouse,
      notes: req.body.notes,
      closedBy: req.user._id,
      closedAt: new Date(),
    });
    res.json({ success: true, data: row });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'That hotel date is already closed.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reopenNight = async (req, res) => {
  try {
    const last = await NightAudit.findOne(scoped(req, { status: 'closed' })).sort({ date: -1, closedAt: -1 });
    if (!last) return res.status(404).json({ success: false, message: 'No closed hotel date to reopen.' });
    if (String(last._id) !== String(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Reopen the latest closed date only.' });
    }
    last.status = 'reopened';
    last.reopenedBy = req.user._id;
    last.reopenedAt = new Date();
    await last.save();
    res.json({ success: true, data: last });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listStaff = async (req, res) => {
  try {
    const User = require('../models/User');
    const data = await User.find(scoped(req, { isActive: { $ne: false }, role: { $ne: 'platform_admin' } }))
      .select('name role')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchGuests = async (req, res) => {
  try {
    const rows = await searchHotelGuests(req, req.query.q);
    res.json({
      success: true,
      data: rows.map((row) => ({
        ...toStayGuest(row),
        _id: row._id,
        stayCount: row.stayCount || 0,
        lastStayAt: row.lastStayAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

function planPayload(body) {
  const kind = RATE_KINDS.includes(body.kind) ? body.kind : '';
  const name = String(body.name || '').trim();
  const mode = body.mode === 'percent_off' ? 'percent_off' : 'fixed';
  return {
    name,
    kind,
    mode,
    nightlyRate: Number(body.nightlyRate) || 0,
    percentOff: Number(body.percentOff) || 0,
    roomType: String(body.roomType || '').trim(),
    customer: body.customer || undefined,
    notes: body.notes,
    isActive: body.isActive !== false,
  };
}

exports.listRatePlans = async (req, res) => {
  try {
    const filter = scoped(req);
    if (req.query.active !== '0') filter.isActive = true;
    const data = await HotelRatePlan.find(filter).populate('customer', 'name company phone').sort({ kind: 1, name: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRatePlan = async (req, res) => {
  try {
    const payload = planPayload(req.body);
    if (!payload.name) return res.status(400).json({ success: false, message: 'Plan name is required.' });
    if (!payload.kind) return res.status(400).json({ success: false, message: 'Pick company, travel agent, or group.' });
    let row;
    if (req.params.id) {
      row = await HotelRatePlan.findOneAndUpdate(scoped(req, { _id: req.params.id }), payload, { new: true });
      if (!row) return res.status(404).json({ success: false, message: 'Rate plan not found.' });
    } else {
      row = await HotelRatePlan.create(payload);
    }
    res.json({ success: true, data: row });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'A plan with that name already exists.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.quoteRate = async (req, res) => {
  try {
    const room = await Room.findOne(scoped(req, { _id: req.query.roomId, isActive: true }));
    if (!room) return res.status(404).json({ success: false, message: 'Room not found.' });
    const priced = await priceStay(req, room, { ratePlanId: req.query.ratePlanId, rate: req.query.rate });
    if (priced.error) return res.status(priced.error.status).json({ success: false, message: priced.error.message });
    res.json({
      success: true,
      data: {
        rack: room.rate,
        quoted: priced.rate,
        kind: priced.plan?.kind || 'rack',
        planName: priced.plan?.name || 'Rack',
        roomType: room.type,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
