const SPLIT_MODES = ['none', 'room_extras', 'two_guests'];

const WINDOWS = {
  none: [{ key: 'main', label: 'Folio' }],
  room_extras: [
    { key: 'room', label: 'Room' },
    { key: 'extras', label: 'Extras' },
  ],
  two_guests: [
    { key: 'guest_a', label: 'Guest 1' },
    { key: 'guest_b', label: 'Guest 2' },
  ],
};

function normalizeSplitMode(value) {
  return SPLIT_MODES.includes(value) ? value : 'none';
}

function windowList(splitMode, folio) {
  const mode = normalizeSplitMode(splitMode);
  return WINDOWS[mode].map((row) => {
    if (mode === 'two_guests' && row.key === 'guest_b') {
      return { ...row, label: folio?.guestBName ? folio.guestBName : 'Guest 2' };
    }
    if (mode === 'two_guests' && row.key === 'guest_a') {
      return { ...row, label: folio?.guestName ? folio.guestName : 'Guest 1' };
    }
    return row;
  });
}

function defaultBucket(splitMode, source, kind) {
  const mode = normalizeSplitMode(splitMode);
  if (mode === 'none') return 'main';
  if (mode === 'two_guests') return 'guest_a';
  if (kind === 'payment' || kind === 'deposit' || kind === 'city_ledger' || kind === 'credit') return 'room';
  if (source === 'room') return 'room';
  return 'extras';
}

function isValidBucket(splitMode, bucket) {
  return windowList(splitMode).some((row) => row.key === bucket);
}

function windowTotals(charges, splitMode, folio) {
  const windows = windowList(splitMode, folio).map((row) => {
    const lines = (charges || []).filter((c) => (c.bucket || defaultBucket(splitMode, c.source, c.kind)) === row.key);
    const charged = lines.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const paid = lines.reduce((s, c) => s + (Number(c.paid) || 0), 0);
    return {
      ...row,
      charged: Math.round(charged * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      balance: Math.round((charged - paid) * 100) / 100,
    };
  });
  return windows;
}

function assignExistingBuckets(folio) {
  const mode = normalizeSplitMode(folio.splitMode);
  (folio.charges || []).forEach((row) => {
    if (!isValidBucket(mode, row.bucket)) {
      row.bucket = defaultBucket(mode, row.source, row.kind);
    }
  });
}

module.exports = {
  SPLIT_MODES,
  WINDOWS,
  normalizeSplitMode,
  windowList,
  defaultBucket,
  isValidBucket,
  windowTotals,
  assignExistingBuckets,
};
