# Hunt Notes

Personal hunting dashboard & notes app -- draw dates, seasons, tags, and
(eventually) GMU/hunt-area research -- backed by SQLite. Mirrors the stack
of the `ratio-charts-sqlite` commodities app on this same machine: Express +
`better-sqlite3` backend, React + TypeScript + Vite frontend.

## Layout

```
hunt-notes/
  index.js, db.js, package.json   -- backend (API on port 4100)
  sql/schema.sql                  -- table definitions
  sql/seed_2026.sql               -- 2026 draw dates & season data (re-run yearly)
  scripts/init-db.js              -- applies schema.sql + seed_2026.sql
  data/HuntNotes.db                -- SQLite file (gitignored)
  Docs/                            -- source CPW brochures (+ extracted .txt for reference)
  frontend/                        -- Vite dev server on port 5180, proxies /api -> :4100
```

## Running it

Backend:
```
npm install        # first time only
npm run db:init     # creates schema + loads seed data (safe to re-run)
npm run dev          # nodemon, http://localhost:4100
```

Frontend:
```
cd frontend
npm install          # first time only
npm run dev           # http://localhost:5180
```

## Updating next year's dates

CPW publishes new Big Game and Small Game & Waterfowl brochures each
year (usually Feb/March). To refresh:

1. Drop the new PDFs in `Docs/`.
2. Copy `sql/seed_2026.sql` to `sql/seed_2027.sql` (or whatever year),
   update the `SeasonYear` values and the date/bag/possession text from
   the new brochure's "At a Glance -- Important Dates" and per-species
   "Season Dates & Bag Limits" pages.
3. `node -e "require('./db').exec(require('fs').readFileSync('sql/seed_2027.sql','utf8'))"`
   (or add it to `scripts/init-db.js`).
4. The Home tab defaults to the latest `SeasonYear` present in the DB,
   or pass `?year=2026` to `/api/home/dashboard` to pin an older one.

## Design notes

- **Draw dates are not per-species.** Colorado runs one unified
  primary/secondary application process for deer, elk and pronghorn (and
  bear/moose, which this app doesn't track), so `DrawDates` has no
  `SpeciesID` -- the Home tab repeats the same calendar under each
  big-game column.
- **Season dates are stored as published text**, not parsed start/end
  dates -- brochure ranges like "Nov. 14, 2026-Jan. 31, 2027" or
  "Sept. 2-30*" are easier to trust verbatim than to re-derive, and the
  asterisked caveats ("unless otherwise noted in hunt code tables")
  matter for actually applying.
- **General/firearm seasons only** -- falconry-specific season dates
  (which differ for a few species) aren't included.
- **Whitetail uses GMU 103 (Plains) as a representative example.**
  Unlike mule deer's fairly uniform statewide season, whitetail dates
  vary a lot by unit, so there's no single "statewide whitetail" date
  to show -- the Whitetail column is seeded from one eastern-plains
  unit's hunt codes (brochure pages 24/26/30) rather than a brochure
  summary table. Swap in a different unit's dates in `seed_2026.sql`
  if a different example area is more useful to you.
