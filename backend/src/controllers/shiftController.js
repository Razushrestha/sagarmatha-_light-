const Shift = require('../models/Shift');
const Sale = require('../models/Sale');
const SaleReturn = require('../models/SaleReturn');
const { scoped } = require('../utils/tenantQuery');

function cashOf(sale) {
  return (sale.payments || [])
    .filter((p) => p.method === 'cash')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

async function summarizeWindow(req, from, to) {
  const range = { $gte: from, $lte: to };
  const sales = await Sale.find(scoped(req, {
    type: { $in: ['invoice', 'estimate'] },
    status: { $in: ['completed', 'partial_return', 'returned'] },
    isHeld: { $ne: true },
    createdAt: range,
  })).select('total payments createdBy invoiceNumber customerName').populate('createdBy', 'name').lean();

  const returns = await SaleReturn.find(scoped(req, {
    createdAt: range,
    refundMethod: 'cash',
  })).select('total').lean();

  const cashSales = sales.reduce((s, row) => s + cashOf(row), 0);
  const cashRefunds = returns.reduce((s, row) => s + (Number(row.total) || 0), 0);

  const byStaff = new Map();
  for (const sale of sales) {
    const id = String(sale.createdBy || 'unknown');
    const prev = byStaff.get(id) || { user: sale.createdBy?._id || sale.createdBy, name: sale.createdBy?.name || 'Staff', invoices: 0, total: 0 };
    prev.invoices += 1;
    prev.total += Number(sale.total) || 0;
    byStaff.set(id, prev);
  }

  return {
    cashSales,
    cashRefunds,
    staffSales: [...byStaff.values()],
  };
}

exports.getCurrent = async (req, res) => {
  try {
    const shift = await Shift.findOne(scoped(req, { status: 'open' }))
      .populate('openedBy', 'name')
      .lean();
    if (!shift) return res.json({ success: true, data: null });
    const summary = await summarizeWindow(req, shift.openedAt, new Date());
    const expectedCash = shift.openingFloat + summary.cashSales - summary.cashRefunds;
    res.json({
      success: true,
      data: {
        ...shift,
        live: { ...summary, expectedCash },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const data = await Shift.find(scoped(req))
      .populate('openedBy', 'name')
      .populate('closedBy', 'name')
      .sort({ openedAt: -1 })
      .limit(60)
      .lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.open = async (req, res) => {
  try {
    const existing = await Shift.findOne(scoped(req, { status: 'open' }));
    if (existing) {
      return res.status(400).json({ success: false, message: 'A shift is already open. Close it first.' });
    }
    const shift = await Shift.create({
      openedBy: req.user._id,
      openingFloat: Math.max(0, Number(req.body.openingFloat) || 0),
      notes: req.body.notes,
    });
    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.close = async (req, res) => {
  try {
    const shift = await Shift.findOne(scoped(req, { _id: req.params.id, status: 'open' }));
    if (!shift) return res.status(404).json({ success: false, message: 'Open shift not found.' });
    const closingCash = Number(req.body.closingCash);
    if (!Number.isFinite(closingCash) || closingCash < 0) {
      return res.status(400).json({ success: false, message: 'Counted cash is required.' });
    }
    const summary = await summarizeWindow(req, shift.openedAt, new Date());
    const expectedCash = shift.openingFloat + summary.cashSales - summary.cashRefunds;
    shift.closedBy = req.user._id;
    shift.closedAt = new Date();
    shift.closingCash = closingCash;
    shift.expectedCash = expectedCash;
    shift.difference = closingCash - expectedCash;
    shift.cashSales = summary.cashSales;
    shift.cashRefunds = summary.cashRefunds;
    shift.staffSales = summary.staffSales;
    shift.notes = req.body.notes || shift.notes;
    shift.status = 'closed';
    await shift.save();
    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
