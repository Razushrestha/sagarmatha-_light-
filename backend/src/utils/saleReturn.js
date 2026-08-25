function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function productId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value);
  return String(value);
}

function remainingQty(item) {
  const qty = Number(item.quantity) || 0;
  const returned = Number(item.returnedQuantity) || 0;
  return Math.max(0, round2(qty - returned));
}

function netFactor(item) {
  const qty = Number(item.quantity) || 0;
  if (qty <= 0) return 0;
  return remainingQty(item) / qty;
}

function netItemValues(item) {
  const factor = netFactor(item);
  return {
    quantity: remainingQty(item),
    subtotal: round2((Number(item.subtotal) || 0) * factor),
    commission: round2((Number(item.commission) || 0) * factor),
  };
}

function saleNetTotal(sale) {
  return round2(Math.max(0, (Number(sale.total) || 0) - (Number(sale.returnedTotal) || 0)));
}

function allocateReturnLines(saleItems, requestedLines) {
  const working = (saleItems || []).map((item, index) => ({
    index,
    product: productId(item.product),
    remaining: remainingQty(item),
    unitPrice: Number(item.unitPrice) || 0,
    quantity: Number(item.quantity) || 0,
    subtotal: Number(item.subtotal) || 0,
    commission: Number(item.commission) || 0,
    productName: item.productName,
    sku: item.sku,
  }));

  const allocations = [];
  const items = [];

  for (const line of requestedLines || []) {
    const qty = round2(Number(line.quantity) || 0);
    if (qty <= 0) continue;
    const pid = productId(line.product);
    let left = qty;

    for (const slot of working) {
      if (left <= 0) break;
      if (slot.product !== pid || slot.remaining <= 0) continue;
      const take = Math.min(slot.remaining, left);
      const share = slot.quantity > 0 ? take / slot.quantity : 0;
      const subtotal = round2(slot.unitPrice * take);
      const commission = round2(slot.commission * share);
      allocations.push({
        saleItemIndex: slot.index,
        quantity: take,
        subtotal,
        commission,
      });
      items.push({
        product: pid,
        productName: line.productName || slot.productName,
        sku: line.sku || slot.sku,
        quantity: take,
        unitPrice: slot.unitPrice,
        subtotal,
      });
      slot.remaining = round2(slot.remaining - take);
      left = round2(left - take);
    }

    if (left > 0.009) {
      const name = line.productName || pid || 'item';
      throw new Error(`Return quantity for ${name} exceeds remaining sold quantity.`);
    }
  }

  if (!allocations.length) {
    throw new Error('Select items and quantities to return.');
  }

  const subtotal = round2(items.reduce((s, i) => s + i.subtotal, 0));
  const commission = round2(allocations.reduce((s, a) => s + a.commission, 0));
  return { allocations, items, subtotal, commission };
}

function applyAllocationsToSale(sale, allocations, { total, vatAmount, commission }) {
  for (const alloc of allocations) {
    const item = sale.items[alloc.saleItemIndex];
    if (!item) continue;
    item.returnedQuantity = round2((Number(item.returnedQuantity) || 0) + alloc.quantity);
  }

  sale.returnedTotal = round2((Number(sale.returnedTotal) || 0) + total);
  sale.returnedVat = round2((Number(sale.returnedVat) || 0) + (vatAmount || 0));
  sale.returnedCommission = round2((Number(sale.returnedCommission) || 0) + (commission || 0));

  const allReturned = (sale.items || []).every((item) => remainingQty(item) <= 0.009);
  sale.status = allReturned ? 'returned' : 'partial_return';
  return { allReturned };
}

function applyRefundToSale(sale, returnTotal, refundMethod) {
  const refund = round2(returnTotal);
  const netTotal = saleNetTotal(sale);
  let cashRefund = 0;
  let dueReduce = 0;

  if (refundMethod === 'credit_note') {
    dueReduce = Math.min(Number(sale.amountDue) || 0, refund);
    sale.amountDue = round2(Math.max(0, (Number(sale.amountDue) || 0) - dueReduce));
    const leftover = round2(refund - dueReduce);
    if (leftover > 0) {
      cashRefund = Math.min(Number(sale.amountPaid) || 0, leftover);
      sale.amountPaid = round2(Math.max(0, (Number(sale.amountPaid) || 0) - cashRefund));
      sale.refundedAmount = round2((Number(sale.refundedAmount) || 0) + cashRefund);
    }
  } else {
    cashRefund = Math.min(Number(sale.amountPaid) || 0, refund);
    sale.amountPaid = round2(Math.max(0, (Number(sale.amountPaid) || 0) - cashRefund));
    sale.refundedAmount = round2((Number(sale.refundedAmount) || 0) + cashRefund);
    const leftover = round2(refund - cashRefund);
    if (leftover > 0) {
      dueReduce = Math.min(Number(sale.amountDue) || 0, leftover);
      sale.amountDue = round2(Math.max(0, (Number(sale.amountDue) || 0) - dueReduce));
    }
  }

  if (sale.amountPaid + sale.amountDue - netTotal > 0.05) {
    sale.amountPaid = Math.min(sale.amountPaid, netTotal);
    sale.amountDue = round2(Math.max(0, netTotal - sale.amountPaid));
  } else if (netTotal - sale.amountPaid - sale.amountDue > 0.05) {
    sale.amountDue = round2(Math.max(0, netTotal - sale.amountPaid));
  }

  return { cashRefund, dueReduce, netTotal };
}

module.exports = {
  round2,
  productId,
  remainingQty,
  netFactor,
  netItemValues,
  saleNetTotal,
  allocateReturnLines,
  applyAllocationsToSale,
  applyRefundToSale,
};
