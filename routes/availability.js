const express = require('express');
const router = express.Router();
const {
  SCHEDULE, FULL_DAY_PRICE, HOURLY_RATE, MIN_HOURS,
  getDayOfWeek, timeToMinutes, minutesToTime, getMaxHours, calcPrice,
} = require('../config/schedule');
const { getReservationsForDate, getBlockedSlotsForDate } = require('../services/metaobjects');

function generateStartTimes(dayStart, dayEnd, durationHours) {
  const start = timeToMinutes(dayStart);
  const end   = timeToMinutes(dayEnd);
  const dur   = durationHours * 60;
  const times = [];
  for (let t = start; t + dur <= end; t += 60) times.push(minutesToTime(t));
  return times;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

// GET /api/availability?date=YYYY-MM-DD[&duration=N&isFullDay=true]
router.get('/', async (req, res) => {
  try {
    const { date, duration, isFullDay } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const dow      = getDayOfWeek(date);
    const schedule = SCHEDULE[dow];
    if (!schedule) return res.json({ open: false });

    const maxHours = getMaxHours(dow);

    // No duration → return day info (available duration options)
    if (!duration) {
      const durations = [];
      for (let h = MIN_HOURS; h <= maxHours; h++) {
        durations.push({ hours: h, price: h * HOURLY_RATE, label: `${h} Hour${h > 1 ? 's' : ''}`, isFullDay: false });
      }
      durations.push({ hours: maxHours, price: FULL_DAY_PRICE[dow], label: 'Full Day', isFullDay: true });
      return res.json({ open: true, schedule, maxHours, durations });
    }

    const durHours = parseInt(duration, 10);
    const fullDay  = isFullDay === 'true';

    if (durHours < MIN_HOURS || durHours > maxHours) return res.json({ slots: [] });

    const [reservations, blocked] = await Promise.all([
      getReservationsForDate(date),
      getBlockedSlotsForDate(date),
    ]);

    const dayStart = timeToMinutes(schedule.start);
    const dayEnd   = timeToMinutes(schedule.end);

    const takenRanges = [
      ...reservations.map(r => ({ s: timeToMinutes(r.start_time), e: timeToMinutes(r.end_time) })),
      ...blocked.map(b => b.start_time && b.end_time
        ? { s: timeToMinutes(b.start_time), e: timeToMinutes(b.end_time) }
        : { s: dayStart, e: dayEnd }),
    ];

    let candidates;
    if (fullDay) {
      candidates = [{ startTime: schedule.start, endTime: schedule.end }];
    } else {
      candidates = generateStartTimes(schedule.start, schedule.end, durHours).map(st => ({
        startTime: st,
        endTime: minutesToTime(timeToMinutes(st) + durHours * 60),
      }));
    }

    const slots = candidates.filter(({ startTime, endTime }) => {
      const s = timeToMinutes(startTime);
      const e = timeToMinutes(endTime);
      return !takenRanges.some(r => overlaps(s, e, r.s, r.e));
    });

    res.json({ slots });
  } catch (err) {
    console.error('Availability error:', err);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

module.exports = router;
