import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { calculateRemainingDays, simulateFutureTrip, toEpochDay } from '../dist/esm/index.js';

const inputPath = resolve(process.env.GITHUB_WORKSPACE ?? process.cwd(), process.env.INPUT_TRIPS_FILE || 'trips.json');
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const trips = Array.isArray(input) ? input : input.trips;
if (!Array.isArray(trips)) throw new Error('Input must be a trip array or an object with a trips array.');

const inputDate = process.env.INPUT_REFERENCE_DATE || input.referenceDate;
const referenceDate = inputDate
  ? (toEpochDay(inputDate), new Date(`${inputDate}T00:00:00.000Z`))
  : new Date();
const calculation = calculateRemainingDays(trips, referenceDate);
const targetEntry = process.env.INPUT_TARGET_ENTRY || input.targetEntry;
const targetExit = process.env.INPUT_TARGET_EXIT || input.targetExit;
let simulation;
if (targetEntry || targetExit) {
  if (!targetEntry || !targetExit) throw new Error('Provide both target-entry and target-exit.');
  toEpochDay(targetEntry);
  toEpochDay(targetExit);
  simulation = simulateFutureTrip(trips, new Date(`${targetEntry}T00:00:00.000Z`), new Date(`${targetExit}T00:00:00.000Z`));
}

if (process.env.GITHUB_OUTPUT) {
  const isOverstay = calculation.isOverstay || simulation?.valid === false;
  const outputs = [
    `days-used=${calculation.daysUsed}`,
    `days-remaining=${calculation.windowDaysRemaining}`,
    `is-overstay=${calculation.isOverstay}`,
    `planned-trip-valid=${simulation?.valid ?? ''}`,
    `first-overstay-date=${simulation?.firstOverstayDate ?? calculation.overstayDate ?? ''}`,
    `max-stay-date=${simulation?.maxStayDate ?? ''}`,
    `badge-status=${isOverstay ? 'overstay' : `${calculation.windowDaysRemaining}-days-left`}`,
  ];
  appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`);
}

const workspace = resolve(process.env.GITHUB_WORKSPACE ?? process.cwd());
const readmePath = resolve(workspace, process.env.INPUT_README_FILE || 'README.md');
if (readmePath !== workspace && !readmePath.startsWith(`${workspace}${sep}`)) {
  throw new Error('readme-file must point to a file inside GITHUB_WORKSPACE.');
}
if (!existsSync(readmePath)) throw new Error(`README file not found: ${readmePath}`);

const badgeIsOverstay = calculation.isOverstay || simulation?.valid === false;
const badgeLabel = badgeIsOverstay ? 'overstay' : `${calculation.windowDaysRemaining} days left`;
const badgeColor = badgeIsOverstay
  ? 'red'
  : calculation.windowDaysRemaining <= 10
    ? 'orange'
    : calculation.windowDaysRemaining <= 30
      ? 'yellow'
      : 'brightgreen';
const badge = `[![Schengen 90/180: ${badgeLabel}](https://img.shields.io/badge/Schengen-${encodeURIComponent(badgeLabel)}-${badgeColor})](https://atlassio.co.uk/schengen-calculator)`;
const markerStart = '<!-- schengen-calculator-core:badge:start -->';
const markerEnd = '<!-- schengen-calculator-core:badge:end -->';
const badgeBlock = `${markerStart}\n${badge}\n${markerEnd}`;
const readme = readFileSync(readmePath, 'utf8');
const startCount = readme.split(markerStart).length - 1;
const endCount = readme.split(markerEnd).length - 1;
if (startCount !== endCount || startCount > 1) {
  throw new Error('README must contain either no badge markers or one matching start/end pair.');
}
const hasStart = startCount === 1;

let updatedReadme;
if (hasStart) {
  const blockPattern = /<!-- schengen-calculator-core:badge:start -->[\s\S]*?<!-- schengen-calculator-core:badge:end -->/;
  updatedReadme = readme.replace(blockPattern, badgeBlock);
  if (updatedReadme === readme && !readme.includes(badgeBlock)) {
    throw new Error('README contains invalid or reversed calculator badge markers.');
  }
} else {
  updatedReadme = `${readme.replace(/\s*$/, '')}\n\n${badgeBlock}\n`;
}

const temporaryReadmePath = `${readmePath}.schengen-calculator-core.tmp`;
writeFileSync(temporaryReadmePath, updatedReadme, 'utf8');
renameSync(temporaryReadmePath, readmePath);

process.stdout.write(`${JSON.stringify({ calculation, ...(simulation ? { simulation } : {}) }, null, 2)}\n`);
if (calculation.isOverstay || simulation?.valid === false) process.exitCode = 1;

