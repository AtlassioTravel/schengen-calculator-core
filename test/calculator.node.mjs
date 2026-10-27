import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateRemainingDays,
  simulateFutureTrip,
  toEpochDay,
} from '../dist/esm/index.js';

const utc = (date) => new Date(`${date}T00:00:00.000Z`);

describe('Schengen 90/180 rolling-window engine', () => {
  it('uses the inclusive 180-day window [T - 179, T]', () => {
    const trips = [{ entryDate: '2026-01-01', exitDate: '2026-01-01' }];
    assert.equal(calculateRemainingDays(trips, utc('2026-06-29')).daysUsed, 1);
    assert.equal(calculateRemainingDays(trips, utc('2026-06-30')).daysUsed, 0);
  });

  it('deduplicates overlapping trips and same-day turnarounds', () => {
    const trips = [
      { entryDate: '2026-05-01', exitDate: '2026-05-10' },
      { entryDate: '2026-05-10', exitDate: '2026-05-20' },
    ];
    assert.equal(calculateRemainingDays(trips, utc('2026-05-20')).daysUsed, 20);
  });

  it('counts leap day and rejects impossible calendar dates', () => {
    const trips = [{ entryDate: '2024-02-28', exitDate: '2024-03-01' }];
    assert.equal(calculateRemainingDays(trips, utc('2024-03-01')).daysUsed, 3);
    assert.throws(() => toEpochDay('2025-02-29'), /Non-existent calendar date/);
  });

  it('reports the first overstay day', () => {
    const trips = [{ entryDate: '2026-01-01', exitDate: '2026-04-05' }];
    const result = calculateRemainingDays(trips, utc('2026-04-05'));
    assert.equal(result.isOverstay, true);
    assert.equal(result.overstayDate, '2026-04-01');
  });

  it('accounts for rolling drop-offs while simulating a stay', () => {
    const existing = [{ entryDate: '2026-01-01', exitDate: '2026-01-30' }];
    const result = simulateFutureTrip(existing, utc('2026-05-01'), utc('2026-07-29'));
    assert.equal(result.valid, true);
    assert.equal(result.maxStayDate, '2026-07-29');
  });

  it('counts each simulated date and returns first breach for an overlong stay', () => {
    const result = simulateFutureTrip([], utc('2026-01-01'), utc('2026-04-05'));
    assert.equal(result.valid, false);
    assert.equal(result.firstOverstayDate, '2026-04-01');
    assert.equal(result.maxStayDate, '2026-03-31');
  });

  it('ignores Ireland and Cyprus and applies phased accession dates', () => {
    const croatiaTrips = [
      { entryDate: '2022-12-25', exitDate: '2023-01-05', countryCode: 'HR' },
    ];
    assert.equal(calculateRemainingDays(croatiaTrips, utc('2023-01-05')).daysUsed, 5);

    const phasedTrips = [
      { entryDate: '2026-01-01', exitDate: '2026-01-20', countryCode: 'IE' },
      { entryDate: '2024-03-29', exitDate: '2024-04-02', countryCode: 'BG', entryMode: 'air' },
      { entryDate: '2024-03-29', exitDate: '2024-04-02', countryCode: 'RO', entryMode: 'land' },
      { entryDate: '2024-12-30', exitDate: '2025-01-02', countryCode: 'RO', entryMode: 'land' },
    ];
    assert.equal(calculateRemainingDays(phasedTrips, utc('2024-04-02')).daysUsed, 3);
    assert.equal(calculateRemainingDays(phasedTrips, utc('2025-01-02')).daysUsed, 2);
  });

  it('counts microstate visits as Schengen days', () => {
    const trips = [{ entryDate: '2026-05-01', exitDate: '2026-05-01', countryCode: 'MC' }];
    assert.equal(calculateRemainingDays(trips, utc('2026-05-01')).daysUsed, 1);
  });

  it('uses UTC calendar components independently of the local timezone', () => {
    const referenceDate = new Date('2026-03-29T00:30:00.000Z');
    const result = calculateRemainingDays(
      [{ entryDate: '2026-03-29', exitDate: '2026-03-29' }],
      referenceDate,
    );
    assert.equal(result.referenceDate, '2026-03-29');
    assert.equal(result.daysUsed, 1);
  });

  it('rejects reversed trip and simulation ranges', () => {
    assert.throws(() => calculateRemainingDays([
      { entryDate: '2026-05-02', exitDate: '2026-05-01' },
    ], utc('2026-05-05')), /cannot precede/);
    assert.throws(() => simulateFutureTrip([], utc('2026-05-02'), utc('2026-05-01')), /cannot precede/);
  });
});
