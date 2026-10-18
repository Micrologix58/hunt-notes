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
  scripts/import_hunt_codes.js    -- loads Docs/extraction/{harvest,draw_points}_*.jsonl (run by hand)
  scripts/import_walkin_areas.js  -- loads Docs/extraction/walkin_areas_*.jsonl (run by hand)
  data/HuntNotes.db                -- SQLite file (gitignored)
  Docs/                            -- source CPW brochures/reports/atlas (PDFs gitignored -- see below)
  Docs/extraction/access_areas.jsonl -- hand-transcribed SWA/STL data, one JSON object per line
  Docs/extraction/walkin_areas_2026.jsonl -- hand-transcribed Walk-In Atlas parcels, one JSON object per line
  Docs/extraction/parse_*.py      -- coordinate-based PDF parsers for the Draw Odds reports
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

## Updating Draw Odds data (harvest stats & preference points)

CPW's statewide harvest and post-draw reports are real text-based PDFs
(unlike the brochures above), but they use *absolute-positioned* text
rather than actual PDF tables -- `pdftotext`'s column-alignment
heuristics badly scramble their rows (hunt codes end up paired with
the wrong data, or two adjacent values merge into one). Getting this
data out required Python scripts
(`Docs/extraction/parse_harvest.py`, `parse_drawn_out.py`,
`parse_deer_recap.py`) that work from raw word *coordinates*
(`pymupdf`) and reconstruct each row by Y-position clustering and
nearest-column-X matching instead.

To add a new year or species:

1. Drop the new report PDF in `Docs/` (CPW publishes these as
   "Statewide Harvest Estimates" for harvest stats, and either a
   compact "Drawn Out At Report" or a "Post Draw Report"/"Post Draw
   Hunt Statistics Report" for preference points -- both of the
   latter two use the same per-hunt-code-or-per-block "Drawn Out At /
   # Drawn at Final Level" box, just at different page granularity).
2. `pip install pymupdf` (one-time; not part of the Node app's own
   dependencies, since these are standalone extraction scripts, not
   something the running app needs).
3. Run the matching parser, e.g.:
   ```
   python Docs/extraction/parse_harvest.py "Docs/2026 Deer Statewide Harvest Final.pdf" deer 2026 Docs/extraction/harvest_deer_2026.jsonl
   python Docs/extraction/parse_deer_recap.py "Docs/2026 Primary DEER Post Draw Report.pdf" deer primary 2026 Docs/extraction/draw_points_deer_primary_2026.jsonl
   ```
   `parse_deer_recap.py` works for any report with one hunt code
   (or a repeating block) per page/section -- it's what was used for
   both the 1,065-page Deer primary report and the Pronghorn
   secondary report, unchanged. `parse_drawn_out.py` is specifically
   for the compact multi-hunt-code-per-page "Drawn Out At Report"
   format.
4. Add the new file(s) to the lists in `scripts/import_hunt_codes.js`,
   then `node scripts/import_hunt_codes.js` (upsert by
   (year, species, hunt code[, draw type]) -- safe to re-run).

Every parser run was spot-checked against the PDF's own rendered page
image before trusting it at scale (see git history for the specific
coordinate-debugging process) -- if a report's layout doesn't match
what these scripts expect, don't assume the output is right; render a
sample page and compare.

## Updating Walk-In Atlas data (free access on enrolled private land)

CPW's "Regular Walk-In Atlas" is a different kind of PDF than everything
else this app pulls from: pages of county maps starting at page 7, one
raster image per county (or county-half), with no text layer over the
shaded parcels at all. Each parcel is just a colored polygon (yellow =
open to small **and** big game, white = small game only) with a single
land-type letter next to it (G = Grass, C = Corn, W = Wheat, O = Other) --
no name, address or acreage like the Access tab's brochure properties
have. That means there's nothing to extract programmatically; every
parcel in `Docs/extraction/walkin_areas_2026.jsonl` was transcribed by
rendering the relevant map page(s) at high DPI (`page.get_pixmap(dpi=300)`
via `pymupdf`), cropping into each cluster of shaded parcels, and reading
its land type, color and rough position (nearest labeled town, or
township/range where a town isn't close enough to be useful) directly off
the image.

Two granularities exist in the data, by necessity:

- **GMU 103 and 109** (the first pass, done before the full statewide
  pass below) are transcribed **one row per shaded shape** -- the area
  the user actually hunts, so it got full precision.
- **Everywhere else** (the full statewide pass) is transcribed **one row
  per cluster** of same-type adjoining shapes near one landmark, with
  `ParcelCount` holding the approximate number of shapes grouped in --
  some counties (Sedgwick, Phillips especially) have 50-80+ individual
  shaded shapes on one page, and transcribing the whole state at
  one-row-per-shape wasn't tractable by hand. A cluster row's `landType`
  is often `'Mixed (...)'` for this reason -- it's covering several
  shapes that aren't all the same letter.

A few things worth knowing if you extend or refine this:

- **Half-county maps overlap by one range column.** Several counties are
  split into "West Half"/"East Half" or "North Half"/"South Half" pages,
  and the shared boundary range (e.g. Kit Carson's R46W/R47W line) is
  drawn on *both* pages so parcels sitting on it aren't cut off. Check for
  this before transcribing a boundary-area parcel twice.
- **Some map pages bleed into a neighboring county that has no page of
  its own.** Lincoln County isn't in this atlas edition at all, but a
  handful of its parcels are visible at the edge of the Kit Carson West
  Half page -- those were transcribed with `county: "Lincoln"` even
  though the `sourcePage` is Kit Carson's.
- **Blue-shaded areas are State Trust Lands, not Walk-In parcels** -- a
  different CPW program with its own legend entry on the Crowley/Otero,
  Bent and Prowers pages (Blue Lake, Timberlake, La Junta, Whiterock
  STL). Some of these are already covered by the Access tab's own
  brochure-sourced data; don't double-count them here. Also watch for a
  county line running past the *same* STL complex on two adjacent map
  pages (Blue Lake/Timberlake appear on both the Crowley & Otero and
  Bent County pages) -- same dedup concern as the half-county overlap.
- **Locator is this app's own invention, not brochure text** -- there's no
  ground truth to check it against beyond the map image itself, so treat
  it as "good enough to relocate the parcel/cluster," not a surveyed
  address. Low-confidence reads say so directly (e.g. `landType: null`
  with a note when a letter wasn't legible) rather than guessing.
- **GMU boundaries (red lines) don't follow county lines**, so a given
  county's map page can show parcels in several different GMUs -- check
  which side of the nearest red GMU boundary a parcel falls on, don't
  assume the whole page is one GMU.
- **A few western-slope pages (Mesa, Dolores) don't overlay GMU
  boundaries at all** -- `GMU` is nullable for exactly this case, and the
  Locator text says so explicitly rather than leaving it unexplained.

To add, split, or refine entries:

1. Find the relevant page(s) in `Docs/2026 Regular Walk-In Atlas.pdf`
   (table of contents on page 2 lists each county's page number).
2. Render and crop with `pymupdf` + Pillow (`pip install pymupdf
   Pillow`) the same way described above -- there's no script to run,
   this is a manual visual-transcription task.
3. Edit `Docs/extraction/walkin_areas_2026.jsonl` (or a new
   `walkin_areas_<year>.jsonl` for a future atlas edition, added to the
   file list in `scripts/import_walkin_areas.js`): append new records,
   or split an existing cluster row into finer ones (e.g. if you want to
   upgrade a GMU from cluster-level to per-shape precision the way GMU
   103/109 are). Each record needs a unique `slug` (the upsert key, so
   pick something stable and descriptive, e.g.
   `'<county>-<gmu>-<nearest-town>-<n>'`) -- if you split a cluster,
   retire its old slug rather than reusing it for one of the new rows,
   so a stale row doesn't linger from a renamed/removed slug (the
   importer only upserts, it never deletes).
4. `node scripts/import_walkin_areas.js` -- safe to re-run; upserts on
   (SeasonYear, slug) and never touches a row's Owner, Notes or Scouted
   columns.

## Design notes

- **Draw dates are not per-species.** Colorado runs one unified
  primary/secondary application process for deer, elk, pronghorn and
  bear (and moose, which this app doesn't track), so `DrawDates` has no
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
  `deer`/`elk`/`pronghorn`/`bear` list, independent of the Home tab's
  `Species` table (which exists for season-date display, not
  application tracking).
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
- **Current Pref. Points is manually entered, not computed.** CPW
  doesn't expose a lookup API for this, so it's just a plain editable
  number -- whatever your last results letter or account page said.
  It sits with Target/Applied rather than inside either draw section,
  since preference points are a primary-draw-only concept (the
  secondary draw doesn't use or award them).
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
- **Camping starts from the brochure's own text, but is user-editable.**
  It's seeded prohibited-by-default unless a property's Restrictions
  explicitly say otherwise (sometimes narrowly, e.g. "by licensed
  hunters during big-game season +/-3 days only"), same as Notes --
  the brochure's text can be stale, wrong, or just not worth tracking
  for a day-access-only property, so the checkbox is yours to correct
  as you research. It saves immediately on click (no debounce, unlike
  Notes), since a checkbox click is already one deliberate edit.
- **Access area data is a one-time import, not part of
  `seed_2026.sql`'s yearly reseed.** `AccessAreas`/`AccessAreaSpecies`
  have their own unique constraints and their own script
  (`import_access_areas.js`, upsert by name+type, never touches
  `Notes`) specifically so `db:init` can never wipe your own notes on
  a property -- see "Updating Access-tab data" above.
- **Draw Odds only has data for Deer and Pronghorn so far** -- those are
  the reports that have been provided. Elk and Bear are both wired up in
  the schema/UI (species filter, `Species` CHECK constraint) and will
  work exactly the same way once their harvest/post-draw PDFs are added
  (see "Updating Draw Odds data" above) -- there's just nothing to show
  for them yet. GMU/Sex/Method are decoded from each hunt code itself
  (8 characters, self-describing -- see the Big Game brochure's "Hunt
  codes contain a lot of information" page), not looked up from a
  separate table, so a hunt code from *any* source shows up correctly
  filterable/sortable the moment it's imported.
- **Preference-point status is kept as published text, not reduced to
  a single number.** "Choice 2", "Leftover Choice 1", "No Apps" and
  "None Drawn" aren't point counts -- they're genuinely different
  outcomes (drawn on a later ranked choice, bought as a leftover,
  nobody applied, or applied and still wasn't drawn even at 0 points).
  `HuntCodeDrawPoints` keeps the full status text per category *and* a
  parsed-out `*Points` integer (only populated when the status really
  is "N Pref Points") so the UI can sort/filter numerically without
  conflating these cases.
- **Harvest and draw-points data can be (and currently are) different
  years per species** -- Deer harvest/primary-draw data is 2025,
  Pronghorn primary/secondary-draw data is 2026 (no 2026 Pronghorn
  harvest survey was available yet). The Draw Odds tab's harvest and
  draw-points columns are independently nullable per hunt code for
  exactly this reason -- there's no requirement that a hunt code have
  data in every source.
- **Walk-In Atlas coverage is statewide but mixed-granularity.** Unlike
  Draw Odds' hunt-code reports, there's no way to script this
  extraction -- the atlas is scanned-map images with no per-parcel
  text, so every row is a manual visual read (see "Updating Walk-In
  Atlas data" above). GMU 103/109 (the area originally asked about) are
  one row per shaded shape, carefully cross-checked including deduping
  shapes shown on two overlapping half-county map pages; the rest of
  the state is one row per *cluster* of nearby same-type shapes
  (`ParcelCount` holds the approximate shape count) -- full
  one-row-per-shape precision everywhere wasn't tractable by hand, and
  a handful of counties (Sedgwick, Phillips) have 50-80+ individual
  shapes on a single page. Upgrade a GMU to per-shape precision by
  splitting its cluster row(s) the way GMU 103/109 already are, if and
  when that area is worth the extra care.
- **Owner is blank on import, by design.** The atlas doesn't name
  landowners at all -- that comes from a separate source entirely
  (e.g. onX Hunt's parcel/landowner layer). `WalkInAreas.Owner` exists
  so you can log what you find there once you've matched a map parcel
  to its actual boundary on the ground, the same way Notes and
  Scouted are yours to fill in as you research each one.
