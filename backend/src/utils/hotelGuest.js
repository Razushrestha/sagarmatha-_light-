const ID_TYPES = ['citizenship', 'passport', 'license', 'voter', 'other'];

function parseGuest(body = {}) {
  const idType = ID_TYPES.includes(body.guestIdType) ? body.guestIdType : 'citizenship';
  const name = String(body.guestName || '').trim();
  return {
    guestName: name,
    guestPhone: String(body.guestPhone || '').trim(),
    guestEmail: String(body.guestEmail || '').trim().toLowerCase(),
    guestIdType: idType,
    guestIdNumber: String(body.guestIdNumber || '').trim(),
    guestNationality: String(body.guestNationality || '').trim() || (name ? 'Nepal' : ''),
    guestAddress: String(body.guestAddress || '').trim(),
  };
}

function guestGaps(guest, { requireId } = { requireId: false }) {
  const missing = [];
  if (!guest?.guestName) missing.push('name');
  if (!guest?.guestPhone) missing.push('phone');
  if (requireId) {
    if (!guest?.guestIdNumber) missing.push('ID / passport number');
    if (!guest?.guestNationality) missing.push('nationality');
    if (!guest?.guestAddress) missing.push('address');
  }
  return missing;
}

function applyGuest(stay, guest) {
  stay.guestName = guest.guestName;
  stay.guestPhone = guest.guestPhone;
  stay.guestEmail = guest.guestEmail;
  stay.guestIdType = guest.guestIdType;
  stay.guestIdNumber = guest.guestIdNumber;
  stay.guestNationality = guest.guestNationality || 'Nepal';
  stay.guestAddress = guest.guestAddress;
  return stay;
}

function mergeGuest(stay, body) {
  return parseGuest({
    guestName: body.guestName != null ? body.guestName : stay.guestName,
    guestPhone: body.guestPhone != null ? body.guestPhone : stay.guestPhone,
    guestEmail: body.guestEmail != null ? body.guestEmail : stay.guestEmail,
    guestIdType: body.guestIdType != null ? body.guestIdType : stay.guestIdType,
    guestIdNumber: body.guestIdNumber != null ? body.guestIdNumber : stay.guestIdNumber,
    guestNationality: body.guestNationality != null ? body.guestNationality : stay.guestNationality,
    guestAddress: body.guestAddress != null ? body.guestAddress : stay.guestAddress,
  });
}

function toStayGuest(row) {
  if (!row) return null;
  return {
    guestName: row.name || row.guestName || '',
    guestPhone: row.phone || row.guestPhone || '',
    guestEmail: row.email || row.guestEmail || '',
    guestIdType: row.idType || row.guestIdType || 'citizenship',
    guestIdNumber: row.idNumber || row.guestIdNumber || '',
    guestNationality: row.nationality || row.guestNationality || 'Nepal',
    guestAddress: row.address || row.guestAddress || '',
  };
}

module.exports = { ID_TYPES, parseGuest, guestGaps, applyGuest, mergeGuest, toStayGuest };
