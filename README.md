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
  scripts/init-db.js              -- applies schema.sql + seed_2026.sql + migrations
  scripts/import_access_areas.js  -- loads Docs/extraction/access_areas.jsonl (run by hand, not by init-db.js)
  data/HuntNotes.db                -- SQLite file (gitignored)
  Docs/                            -- source CPW brochures (PDFs gitignored -- see below)
  Docs/extraction/access_areas.jsonl -- hand-transcribed SWA/STL data, one JSON object per line
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

## Updating Access-tab data (SWA/STL properties)

CPW's "State Recreation Lands" brochure is a scanned/image-only PDF (no
text layer), so there's no quick re-extraction -- updating it means
re-reading the relevant pages by hand and editing
`Docs/extraction/access_areas.jsonl` (one JSON object per line: `name`,
`type` ('SWA'/'STL'), `county`, `gmus`, `acres`, `species` (array),
`recreation`, `facilities`, `camping` (bool), `restrictions`, `dist`
(estimated road miles from Denver -- not in the brochure, which gives
turn-by-turn directions instead), `page`). After editing, reload with:

```
node scripts/import_access_areas.js
```

This is an upsert keyed by (name, type) and never touches a row's
`Notes` -- adding or correcting properties never wipes your own notes
on existing ones.

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
- **My Hunt tracks "Deer" as one combined species**, not separate
  Mule Deer/Whitetail rows like the Home tab. CPW only allows one deer
  application per draw per year -- which GMU/hunt code you pick decides
  whether it's effectively a mule deer or whitetail hunt, but it's a
  single application -- so `MyHuntPlans.SpeciesKey` is its own small
  `deer`/`elk`/`pronghorn` list, independent of the Home tab's `Species`
  table (which exists for season-date display, not application
  tracking).
- **My Hunt rows are created on demand**, not pre-seeded -- `GET
  /api/my-hunt/plans` always returns one entry per tracked species,
  defaulted blank if nothing's been saved. That keeps this table
  completely outside `seed_2026.sql`'s delete-and-reload pattern, so
  re-running `db:init` can never wipe anything you've entered.
- **My Hunt has no tab-level "Save" button** -- each field autosaves
  (debounced ~500ms) with a small Saving…/Saved indicator next to the
  species header. Switching tabs or reloading the page does not lose
  data, but reloading the page does reset which tab is showing (Home)
  since there's no URL routing yet.
- **Leftover/OTC tags are an unbounded list per species/year**
  (`MyHuntLeftoverPurchases`), not columns on `MyHuntPlans`. CPW's "one
  license per species, per draw" limit applies only to the primary and
  secondary *draws* -- a Leftover/OTC purchase isn't a draw, and List
  A/B hunts can let you hold more than one tag for the same species in
  the same year (e.g. a drawn List A archery tag plus a purchased List
  B rifle tag in an adjacent unit, or even two List B leftover
  purchases). Primary Draw and Secondary Draw stay single-valued on
  `MyHuntPlans`, since CPW really does award at most one license per
  species per draw.
- **Access tab data was hand-transcribed from a scanned PDF.** The
  "2026 Colorado State Recreation Lands" brochure has no text layer at
  all (85 pages, every one an image) -- there was nothing to run
  `pdftotext` against, so every SWA/STL property (633 total) was read
  visually page by page. Only properties with an explicit "Hunting:"
  field in the brochure are included -- fishing-only/wildlife-viewing-only
  SWAs and STLs are left out, since the whole point of this tab is
  hunting access. A few properties with ambiguous species info (hunting
  clearly allowed per the restrictions text, but no species named) are
  included with an empty species list rather than guessed at.
- **Distance from Denver is estimated, not from the brochure.** The
  brochure gives turn-by-turn directions instead of a straight
  distance figure -- `DistanceFromDenverMiles` is a rounded (nearest 5
  mi) road-distance estimate from the referenced town/highway, good
  enough for "is this a day trip" planning but not precise.
- **Camping reflects the brochure's own text**, not a design choice:
  SWA/STL camping is prohibited by default unless a property's
  Restrictions explicitly say otherwise (sometimes narrowly, e.g. "by
  licensed hunters during big-game season +/-3 days only").
- **Access area data is a one-time import, not part of
  `seed_2026.sql`'s yearly reseed.** `AccessAreas`/`AccessAreaSpecies`
  have their own unique constraints and their own script
  (`import_access_areas.js`, upsert by name+type, never touches
  `Notes`) specifically so `db:init` can never wipe your own notes on
  a property -- see "Updating Access-tab data" above.
