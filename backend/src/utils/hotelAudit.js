const { addDaysYmd } = require('./hotelDates');

function nextHotelDate(lastClosedYmd, today) {
  if (!lastClosedYmd) return today;
  return addDaysYmd(lastClosedYmd, 1);
}

function canCloseDate(date, lastClosedYmd, today) {
  if (!date || date > today) return false;
  if (!lastClosedYmd) return true;
  return date === addDaysYmd(lastClosedYmd, 1);
}

function closeBlockedReason(date, lastClosedYmd, today) {
  if (!date) return 'Pick the hotel date to close.';
  if (date > today) return 'Cannot close a future hotel date.';
  if (lastClosedYmd && date !== addDaysYmd(lastClosedYmd, 1)) {
    return `Close ${addDaysYmd(lastClosedYmd, 1)} next (last closed ${lastClosedYmd}).`;
  }
  return '';
}

module.exports = { nextHotelDate, canCloseDate, closeBlockedReason };
