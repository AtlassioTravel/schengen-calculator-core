# schengen-calculator-core

[![Download Atlassio Schengen Calculator](https://a.fsdn.com/con/app/sf-download-button)](https://sourceforge.net/projects/schengen-calculator-core/files/latest/download)

Zero-runtime-dependency TypeScript engine and CLI for Schengen short-stay 90/180-day calculations.

## Install

```sh
npm install schengen-calculator-core
```

## API

```ts
import { calculateRemainingDays, simulateFutureTrip, type Trip } from 'schengen-calculator-core';

const trips: Trip[] = [
  { entryDate: '2026-01-01', exitDate: '2026-01-20' },
];

const result = calculateRemainingDays(trips, new Date('2026-06-01T00:00:00Z'));
const planned = simulateFutureTrip(
  trips,
  new Date('2026-07-01T00:00:00Z'),
  new Date('2026-07-20T00:00:00Z'),
);
```

`Trip` dates use strict `YYYY-MM-DD` calendar strings. `Date` arguments are interpreted by their UTC calendar date. Entry and exit days both count; overlapping dates count once. Ireland and Cyprus trips are excluded. Croatia dates count from 1 January 2023. For Bulgaria and Romania, `entryMode: 'air' | 'sea'` counts from 31 March 2024; land or unspecified mode counts from 1 January 2025, when full Schengen membership began. These dates reflect the phased accession dates published by the [European Commission](https://home-affairs.ec.europa.eu/news/bulgaria-and-romania-join-schengen-area-2025-01-03_en).

`calculateRemainingDays` returns the reference date, days used and remaining, maximum consecutive stay from that date, overstay status and date, and the next date with a full allowance. `simulateFutureTrip` checks every day of the inclusive proposed stay, including rolling-window drop-offs.

## CLI

Input can be a JSON file or standard input. JSON accepts either a trip array or an object with a `trips` array and optional `referenceDate`, `targetEntry`, and `targetExit` fields.

```sh
npx --yes --package schengen-calculator-core schengen-calc trips.json
cat trips.json | npx --yes --package schengen-calculator-core schengen-calc --json
```

Add `--fail-on-overstay` to return a non-zero exit code when the ledger or optional planned trip exceeds the allowance.

## JSON Schema

Add `"$schema": "https://atlassio.co.uk/schemas/trips.json"` to a calculator input file for editor validation.

## GitHub Action

```yaml
- uses: atlassio/schengen-calculator-core@v1
  with:
    trips-file: trips.json
    target-entry: 2026-07-01
    target-exit: 2026-07-20
```

The action updates a marker-bounded compliance badge in the caller's `README.md`, writes calculation outputs, and fails when the ledger or planned stay exceeds the allowance. The workflow can commit the README change if it should persist.

## Development

```sh
npm install
npm run check
```

The package builds ESM, CommonJS, and TypeScript declarations. It has no runtime dependencies. Licensed under MIT. More travel tools: [Atlassio](https://atlassio.co.uk).
