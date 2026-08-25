const Electrician = require('../models/Electrician');
const Sale = require('../models/Sale');
const { summarizeElectricianCommission } = require('../utils/electricianCommission');

exports.getElectricians = async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { number1: { $regex: search, $options: 'i' } },
        { number2: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [electricians, total] = await Promise.all([
      Electrician.find(query).sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
      Electrician.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: electricians,
      pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit) || 1) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createElectrician = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const number1 = String(req.body.number1 || '').trim();
    if (!name || !number1) {
      return res.status(400).json({ success: false, message: 'Name and Number 1 are required.' });
    }

    const electrician = await Electrician.create({
      name,
      number1,
      number2: String(req.body.number2 || '').trim(),
      address: String(req.body.address || '').trim(),
      notes: String(req.body.notes || '').trim(),
      commissionPercent: Math.min(100, Math.max(0, Number(req.body.commissionPercent) || 5)),
    });
    res.status(201).json({ success: true, data: electrician });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateElectrician = async (req, res) => {
  try {
    const payload = {
      name: String(req.body.name || '').trim(),
      number1: String(req.body.number1 || '').trim(),
      number2: String(req.body.number2 || '').trim(),
      address: String(req.body.address || '').trim(),
      notes: String(req.body.notes || '').trim(),
      commissionPercent: Math.min(100, Math.max(0, Number(req.body.commissionPercent) || 5)),
    };
    if (!payload.name || !payload.number1) {
      return res.status(400).json({ success: false, message: 'Name and Number 1 are required.' });
    }

    const electrician = await Electrician.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!electrician) return res.status(404).json({ success: false, message: 'Electrician not found.' });
    res.json({ success: true, data: electrician });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteElectrician = async (req, res) => {
  try {
    const electrician = await Electrician.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!electrician) return res.status(404).json({ success: false, message: 'Electrician not found.' });
    res.json({ success: true, message: 'Electrician removed.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCommission = async (req, res) => {
  try {
    const electrician = await Electrician.findById(req.params.id).lean();
    if (!electrician || electrician.isActive === false) {
      return res.status(404).json({ success: false, message: 'Electrician not found.' });
    }

    const sales = await Sale.find({
      electrician: electrician._id,
      type: { $in: ['invoice', 'estimate'] },
      status: { $nin: ['cancelled', 'draft'] },
      isHeld: { $ne: true },
    })
      .populate({ path: 'items.product', select: 'category', populate: { path: 'category', select: 'name' } })
      .select('invoiceNumber type customerName total items createdAt returnedTotal returnedCommission')
      .lean();

    const summary = summarizeElectricianCommission(sales, electrician);
    res.json({ success: true, data: { electrician, summary } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.receiveCommission = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Enter a valid commission received amount.' });
    }

    const electrician = await Electrician.findById(req.params.id);
    if (!electrician || electrician.isActive === false) {
      return res.status(404).json({ success: false, message: 'Electrician not found.' });
    }

    const sales = await Sale.find({
      electrician: electrician._id,
      type: { $in: ['invoice', 'estimate'] },
      status: { $nin: ['cancelled', 'draft'] },
      isHeld: { $ne: true },
    })
      .populate({ path: 'items.product', select: 'category', populate: { path: 'category', select: 'name' } })
      .select('invoiceNumber type customerName total items createdAt returnedTotal returnedCommission')
      .lean();

    const summary = summarizeElectricianCommission(sales, electrician.toObject());
    if (amount > summary.toTake + 0.009) {
      return res.status(400).json({
        success: false,
        message: `Amount exceeds commission to take (${summary.toTake.toFixed(2)}).`,
      });
    }

    electrician.commissionReceived.push({
      amount,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      notes: String(req.body.notes || '').trim(),
    });
    await electrician.save();

    const refreshed = await Electrician.findById(electrician._id).lean();
    const nextSummary = summarizeElectricianCommission(sales, refreshed);
    res.json({ success: true, data: { electrician: refreshed, summary: nextSummary } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
