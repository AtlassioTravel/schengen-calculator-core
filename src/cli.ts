#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { calculateRemainingDays, simulateFutureTrip, toEpochDay, type Trip } from './index.js';

interface CliInput {
  trips: Trip[];
  referenceDate?: string;
  targetEntry?: string;
  targetExit?: string;
}

function parseInput(raw: string): CliInput {
  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) return { trips: parsed as Trip[] };
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as CliInput).trips)) {
    throw new Error('Input must be a JSON array of trips or an object with a "trips" array.');
  }
  return parsed as CliInput;
}

function asUtcDate(isoDate: string): Date {
  toEpochDay(isoDate);
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function usage(): void {
  process.stdout.write('Usage: schengen-calc [trips.json] [--json] [--fail-on-overstay]\n');
  process.stdout.write('Read JSON from stdin when no file is supplied.\n');
}

try {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }

  const jsonOutput = args.includes('--json');
  const failOnOverstay = args.includes('--fail-on-overstay');
  const inputPath = args.find((arg) => !arg.startsWith('--'));
  const raw = inputPath ? readFileSync(inputPath, 'utf8') : readFileSync(0, 'utf8');
  const input = parseInput(raw);
  const referenceDate = input.referenceDate ? asUtcDate(input.referenceDate) : new Date();
  const calculation = calculateRemainingDays(input.trips, referenceDate);

  let simulation: ReturnType<typeof simulateFutureTrip> | undefined;
  if (input.targetEntry || input.targetExit) {
    if (!input.targetEntry || !input.targetExit) {
      throw new Error('Provide both "targetEntry" and "targetExit" to simulate a trip.');
    }
    simulation = simulateFutureTrip(input.trips, asUtcDate(input.targetEntry), asUtcDate(input.targetExit));
  }

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify({ calculation, ...(simulation ? { simulation } : {}) }, null, 2)}\n`);
  } else {
    const width = 30;
    const filled = Math.round((Math.min(calculation.daysUsed, 90) / 90) * width);
    const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
    process.stdout.write(`Schengen 90/180 timeline — ${calculation.referenceDate}\n`);
    process.stdout.write(`[${bar}] ${calculation.daysUsed}/90 days used\n`);
    process.stdout.write(`${calculation.windowDaysRemaining} days currently available; up to ${calculation.maxConsecutiveStayDays} consecutive days from the reference date.\n`);
    process.stdout.write(`Next full allowance: ${calculation.nextFullAllowanceDate}\n`);
    if (calculation.isOverstay) process.stdout.write(`Overstay detected${calculation.overstayDate ? ` from ${calculation.overstayDate}` : ''}.\n`);
    if (simulation) {
      process.stdout.write(`Planned trip: ${simulation.valid ? 'valid' : 'overstay'}; maximum stay through ${simulation.maxStayDate}.\n`);
      if (simulation.firstOverstayDate) process.stdout.write(`First overstay day: ${simulation.firstOverstayDate}.\n`);
    }
  }

  if (failOnOverstay && (calculation.isOverstay || simulation?.valid === false)) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write('Run schengen-calc --help for usage.\n');
  process.exitCode = 2;
}
