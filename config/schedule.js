// Operating hours per day (0=Sun, 1=Mon, ..., 6=Sat)
const SCHEDULE = {
  0: { start: '12:00', end: '20:00', name: 'Sunday' },
  1: { start: '16:00', end: '20:00', name: 'Monday' },
  2: { start: '16:00', end: '20:00', name: 'Tuesday' },
  3: { start: '16:00', end: '20:00', name: 'Wednesday' },
  4: { start: '16:00', end: '20:00', name: 'Thursday' },
  5: { start: '16:00', end: '20:00', name: 'Friday' },
  6: { start: '11:00', end: '20:00', name: 'Saturday' },
};

// Flat-rate full-day prices (discounted vs. hourly)
const FULL_DAY_PRICE = {
  0: 50,
  1: 30,
  2: 30,
  3: 30,
  4: 30,
  5: 30,
  6: 50,
};

const HOURLY_RATE = 0; // TEST ONLY — change back to 10 after testing
const MIN_HOURS = 2;

// Derive day-of-week safely from a YYYY-MM-DD string (avoids UTC offset issues)
function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getMaxHours(dayOfWeek) {
  const s = SCHEDULE[dayOfWeek];
  if (!s) return 0;
  return Math.floor((timeToMinutes(s.end) - timeToMinutes(s.start)) / 60);
}

function calcPrice(dayOfWeek, durationHours, isFullDay) {
  if (isFullDay) return FULL_DAY_PRICE[dayOfWeek];
  return durationHours * HOURLY_RATE;
}

module.exports = {
  SCHEDULE,
  FULL_DAY_PRICE,
  HOURLY_RATE,
  MIN_HOURS,
  getDayOfWeek,
  timeToMinutes,
  minutesToTime,
  getMaxHours,
  calcPrice,
};
