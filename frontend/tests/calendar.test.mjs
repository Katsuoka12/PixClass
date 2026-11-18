import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { bangkokDate, currentBangkokMonth, calendarDays, shiftMonth, validMonth } from '../utils/calendar.ts';

test('Bangkok calendar date rolls over at17:00UTC regardless of device timezone', () => {
  assert.equal(bangkokDate('2026-11-30T16:59:59Z'), '2026-11-30');
  assert.equal(bangkokDate('2026-11-30T17:00:00Z'), '2026-12-01');
  assert.equal(bangkokDate('2026-12-01T00:00:00+07:00'), '2026-12-01');
  assert.equal(currentBangkokMonth(new Date('2026-12-31T17:00:00Z')), '2027-01');
  assert.equal(bangkokDate('invalid'), null);
  assert.equal(bangkokDate('2026-12-01T00:00:00'), null);
  assert.equal(bangkokDate(null), null);
});
test('month validation and navigation enforce supported bounds', () => {
  for (const invalid of ['1999-12', '2101-01', '2026-00', '2026-13', '26-01', '2026-1', '2026-01x', ['2026-01'], undefined]) assert.equal(validMonth(invalid), false);
  assert.equal(validMonth('2000-01'), true);
  assert.equal(validMonth('2100-12'), true);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2000-01', -1), null);
  assert.equal(shiftMonth('2100-12', 1), null);
  assert.equal(shiftMonth('2026-13', 1), null);
});
test('month grid handles leap years, weekday alignment and invalid input', () => {
  const leap = calendarDays('2024-02');
  assert.equal(leap.filter(Boolean).length, 29);
  assert.equal(leap[4], '2024-02-01');
  assert.equal(calendarDays('2100-02').filter(Boolean).length, 28);
  assert.equal(calendarDays('2026-11')[0], '2026-11-01');
  assert.equal(leap.length % 7, 0);
  assert.deepEqual(calendarDays('invalid'), []);
});
