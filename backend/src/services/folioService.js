const Folio = require('../models/Folio');
const { sessionOpts } = require('../utils/mongoTransaction');
const { defaultBucket, isValidBucket, normalizeSplitMode } = require('../utils/folioBuckets');

async function addCharge({ folioId, saleId, description, source, amount, paid, kind, method, bucket, session }) {
  if (!folioId) return null;
  const folio = session
    ? await Folio.findById(folioId).session(session)
    : await Folio.findById(folioId);
  if (!folio || folio.status !== 'open') return null;
  const chargeAmount = Number(amount) || 0;
  const paidAmount = Number(paid) || 0;
  const lineKind = kind || (paidAmount > 0 && !(chargeAmount > 0) ? 'payment' : 'charge');
  const mode = normalizeSplitMode(folio.splitMode);
  const lineBucket = isValidBucket(mode, bucket) ? bucket : defaultBucket(mode, source, lineKind);
  folio.charges.push({
    sale: saleId,
    description,
    source,
    kind: lineKind,
    method: method || undefined,
    bucket: lineBucket,
    amount: chargeAmount,
    paid: paidAmount,
    at: new Date(),
  });
  folio.balance = Math.round((Number(folio.balance) + chargeAmount - paidAmount) * 100) / 100;
  await folio.save(sessionOpts(session));
  return folio;
}

module.exports = { addCharge };
