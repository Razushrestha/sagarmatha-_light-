function formatMoney(n) {
  return `NPR ${Number(n || 0).toFixed(2)}`;
}

function folioLines(folio, windowKey) {
  const charges = folio.charges || [];
  if (!windowKey) return charges;
  return charges.filter((row) => (row.bucket || 'main') === windowKey);
}

function formatFolioEmail(folio, shop = {}, windowKey = '') {
  const win = (folio.windows || []).find((w) => w.key === windowKey);
  const lines = folioLines(folio, windowKey);
  const guest = folio.stay?.guestName || folio.guestName || 'Guest';
  const room = folio.stay?.room?.number || '';
  const shopName = shop.companyName || 'Hotel';
  const charged = win?.charged ?? folio.charged ?? 0;
  const paid = win?.paid ?? folio.paid ?? 0;
  const balance = win?.balance ?? folio.balance ?? 0;
  const title = win ? `${win.label} folio` : 'Guest folio';
  const rows = lines.map((row) => {
    const money = Number(row.paid) > 0 ? `- ${formatMoney(row.paid)}` : formatMoney(row.amount);
    return `${row.label || row.kind} · ${row.description || ''} · ${money}`;
  });
  const text = [
    shopName,
    shop.address || '',
    shop.vatNumber ? `VAT ${shop.vatNumber}` : '',
    '',
    title,
    `${guest}${room ? ` · Room ${room}` : ''}`,
    '',
    ...rows,
    '',
    `Charged ${formatMoney(charged)}`,
    `Paid ${formatMoney(paid)}`,
    `Balance ${formatMoney(balance)}`,
  ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n');

  const htmlRows = lines.map((row) => {
    const money = Number(row.paid) > 0 ? `- ${formatMoney(row.paid)}` : formatMoney(row.amount);
    return `<tr><td>${row.label || row.kind || ''}</td><td>${row.description || ''}</td><td style="text-align:right">${money}</td></tr>`;
  }).join('');

  const html = `<p><strong>${shopName}</strong><br/>${shop.address || ''}</p>
<h2>${title}</h2>
<p>${guest}${room ? ` · Room ${room}` : ''}</p>
<table width="100%" cellpadding="4">${htmlRows}</table>
<p>Charged ${formatMoney(charged)}<br/>Paid ${formatMoney(paid)}<br/><strong>Balance ${formatMoney(balance)}</strong></p>`;

  return {
    subject: `${title} · ${guest}${room ? ` · Room ${room}` : ''}`,
    text,
    html,
  };
}

module.exports = { formatFolioEmail, formatMoney, folioLines };
