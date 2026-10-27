export interface Trip {
  entryDate: string;
  exitDate: string;
  countryCode?: string;
  /** Border used to enter Bulgaria or Romania during their phased Schengen accession. */
  entryMode?: 'air' | 'sea' | 'land';
}

export interface CalculationResult {
  referenceDate: string;
  daysUsed: number;
  windowDaysRemaining: number;
  maxConsecutiveStayDays: number;
  isOverstay: boolean;
  overstayDate?: string;
  nextFullAllowanceDate: string;
}

export interface SimulationResult {
  valid: boolean;
  daysUsedAtExit: number;
  firstOverstayDate?: string;
  maxStayDate: string;
}

const MS_PER_DAY = 86_400_000;
const WINDOW_SIZE = 180;
const MAX_STAY = 90;
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const NON_SCHENGEN_EU = new Set(['IE', 'CY']);
const HR_ACCESSION_DAY = toEpochDay('2023-01-01');
const BG_RO_AIR_SEA_DAY = toEpochDay('2024-03-31');
const BG_RO_LAND_DAY = toEpochDay('2025-01-01');

function epochDayFromParts(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) {
    throw new Error('Non-existent calendar date.');
  }
  return Math.floor(date.getTime() / MS_PER_DAY);
}

/** Converts a strict YYYY-MM-DD calendar date to a UTC-based integer day. */
export function toEpochDay(isoDate: string): number {
  const match = ISO_DATE_REGEX.exec(isoDate);
  if (!match) {
    throw new Error(`Invalid ISO date format "${isoDate}". Expected YYYY-MM-DD.`);
  }

  try {
    return epochDayFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
  } catch {
    throw new Error(`Non-existent calendar date "${isoDate}".`);
  }
}

/** Converts a UTC-based integer day to a YYYY-MM-DD calendar date. */
export function fromEpochDay(epochDay: number): string {
  if (!Number.isInteger(epochDay)) throw new Error('Epoch day must be an integer.');
  const date = new Date(epochDay * MS_PER_DAY);
  if (Number.isNaN(date.getTime())) throw new Error('Epoch day is outside the supported date range.');
  return date.toISOString().slice(0, 10);
}

function dateToEpochDay(date: Date, label: string): number {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid Date.`);
  }
  return epochDayFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function accessionDay(trip: Trip): number | undefined {
  const countryCode = trip.countryCode?.trim().toUpperCase();
  if (countryCode === 'HR') return HR_ACCESSION_DAY;
  if (countryCode === 'BG' || countryCode === 'RO') {
    return trip.entryMode === 'air' || trip.entryMode === 'sea'
      ? BG_RO_AIR_SEA_DAY
      : BG_RO_LAND_DAY;
  }
  return undefined;
}

/** Expands trips to unique Schengen-countable UTC calendar days. */
export function buildOccupiedDaySet(trips: readonly Trip[]): Set<number> {
  const occupied = new Set<number>();

  for (const trip of trips) {
    const countryCode = trip.countryCode?.trim().toUpperCase();
    if (countryCode && NON_SCHENGEN_EU.has(countryCode)) continue;

    const start = toEpochDay(trip.entryDate);
    const end = toEpochDay(trip.exitDate);
    if (end < start) {
      throw new Error(`Trip exitDate (${trip.exitDate}) cannot precede entryDate (${trip.entryDate}).`);
    }

    const effectiveStart = Math.max(start, accessionDay(trip) ?? start);
    for (let day = effectiveStart; day <= end; day += 1) occupied.add(day);
  }

  return occupied;
}

/** Counts occupied days in the inclusive window [referenceDay - 179, referenceDay]. */
export function countDaysInWindow(occupied: ReadonlySet<number>, referenceDay: number): number {
  let count = 0;
  for (let day = referenceDay - (WINDOW_SIZE - 1); day <= referenceDay; day += 1) {
    if (occupied.has(day)) count += 1;
  }
  return count;
}

/** Calculates current 90/180-day usage. Date arguments are read by their UTC calendar date. */
export function calculateRemainingDays(
  trips: readonly Trip[],
  referenceDate: Date = new Date(),
): CalculationResult {
  const referenceDay = dateToEpochDay(referenceDate, 'referenceDate');
  const occupied = buildOccupiedDaySet(trips);
  const historical = new Set(Array.from(occupied).filter((day) => day <= referenceDay));
  const sortedHistorical = Array.from(historical).sort((a, b) => a - b);

  let overstayDay: number | undefined;
  for (const day of sortedHistorical) {
    if (countDaysInWindow(historical, day) > MAX_STAY) {
      overstayDay = day;
      break;
    }
  }

  const daysUsed = countDaysInWindow(historical, referenceDay);
  const stayDays = new Set(historical);
  let maxConsecutiveStayDays = 0;
  for (let offset = 0; offset < MAX_STAY; offset += 1) {
    const day = referenceDay + offset;
    stayDays.add(day);
    if (countDaysInWindow(stayDays, day) > MAX_STAY) break;
    maxConsecutiveStayDays += 1;
  }

  const lastOccupiedDay = sortedHistorical.at(-1);
  const nextFullAllowanceDay = daysUsed === 0 || lastOccupiedDay === undefined
    ? referenceDay
    : lastOccupiedDay + WINDOW_SIZE;

  return {
    referenceDate: fromEpochDay(referenceDay),
    daysUsed,
    windowDaysRemaining: Math.max(0, MAX_STAY - daysUsed),
    maxConsecutiveStayDays,
    isOverstay: overstayDay !== undefined || daysUsed > MAX_STAY,
    ...(overstayDay === undefined ? {} : { overstayDate: fromEpochDay(overstayDay) }),
    nextFullAllowanceDate: fromEpochDay(nextFullAllowanceDay),
  };
}

/** Simulates an inclusive trip and checks every rolling 180-day window during it. */
export function simulateFutureTrip(
  existingTrips: readonly Trip[],
  targetEntry: Date,
  targetExit: Date,
): SimulationResult {
  const startDay = dateToEpochDay(targetEntry, 'targetEntry');
  const endDay = dateToEpochDay(targetExit, 'targetExit');
  if (endDay < startDay) {
    throw new Error('targetExit cannot precede targetEntry.');
  }

  const occupied = buildOccupiedDaySet(existingTrips);
  const simulated = new Set(occupied);
  let firstOverstayDay: number | undefined;
  for (let day = startDay; day <= endDay; day += 1) {
    simulated.add(day);
    if (firstOverstayDay === undefined && countDaysInWindow(simulated, day) > MAX_STAY) {
      firstOverstayDay = day;
    }
  }

  const maxStay = new Set(occupied);
  let lastValidDay = startDay - 1;
  for (let offset = 0; offset < MAX_STAY; offset += 1) {
    const day = startDay + offset;
    maxStay.add(day);
    if (countDaysInWindow(maxStay, day) > MAX_STAY) break;
    lastValidDay = day;
  }

  return {
    valid: firstOverstayDay === undefined,
    daysUsedAtExit: countDaysInWindow(simulated, endDay),
    ...(firstOverstayDay === undefined ? {} : { firstOverstayDate: fromEpochDay(firstOverstayDay) }),
    maxStayDate: lastValidDay < startDay ? 'NONE (0 days available)' : fromEpochDay(lastValidDay),
  };
}

