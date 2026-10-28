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
  scripts/import_herd_population.js -- loads Docs/extraction/population_<species>_*.jsonl (run by hand)
  scripts/import_herd_tag_quotas.js -- sums GMU quotas by DAU from draw_points_<species>_primary_*.jsonl (run by hand)
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

CPW's statewide harvest and post-draw reports are mostly real text-based
PDFs (unlike the brochures above), but most of them use
*absolute-positioned* text rather than actual PDF tables --
`pdftotext`'s column-alignment heuristics badly scramble their rows
(hunt codes end up paired with the wrong data, or two adjacent values
merge into one). Getting this data out required Python scripts
(`Docs/extraction/parse_harvest.py`, `parse_drawn_out.py`,
`parse_deer_recap.py`) that work from raw word *coordinates*
(`pymupdf`) and reconstruct each row by Y-position clustering and
nearest-column-X matching instead. The one exception so far is the Bear
harvest report (`parse_bear_harvest.py`), which turned out to be a
genuine single-column table -- its text already comes out in reading
order, so that parser just scans the flat token stream for
hunt-code-shaped tokens and reads off the 6 numbers after each one; no
coordinate work needed. Don't assume a new report matches either
pattern -- check with `page.get_text()` on a sample page first (compare
it against the rendered page image) before picking which approach to use.

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
   `parse_deer_recap.py` works for any report with one hunt code (or a
   repeating block) per page/section, **portrait or landscape** -- it's
   what was used for the 1,065-page Deer primary report, the Pronghorn
   secondary report, and the Bear primary report (landscape-oriented,
   unlike the other two -- its "# Drawn / Hunt Code / List" box sits a
   bit further down the page, which is why `HUNT_CODE_BOX_Y_MAX` is a
   generous 230 rather than tuned tightly to one layout). `parse_drawn_out.py`
   is specifically for the compact multi-hunt-code-per-page "Drawn Out
   At Report" format.
4. Add the new file(s) to the lists in `scripts/import_hunt_codes.js`,
   then `node scripts/import_hunt_codes.js` (upsert by
   (year, species, hunt code[, draw type]) -- safe to re-run).

Every parser run was spot-checked against the PDF's own rendered page
image before trusting it at scale (see git history for the specific
coordinate-debugging process) -- if a report's layout doesn't match
what these scripts expect, don't assume the output is right; render a
sample page and compare. After adding Bear, this included a full
regression check of `parse_deer_recap.py`'s existing Deer output
(re-ran it against the original Deer PDF and diffed every field against
the already-committed `draw_points_deer_primary_2025.jsonl` -- zero
differences) since the `HUNT_CODE_BOX_Y_MAX` change touches a shared script.

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

## Updating Herd data (population estimates & sex ratios, by species)

CPW publishes an annual "Post Hunt Population & Sex Ratio Estimates"
PDF per species (currently Deer and Elk; same template for Pronghorn/
Bear whenever those get added) -- one row per DAU (Data Analysis Unit,
a group of GMUs managed as one herd): DAU number, herd name (most
years), the GMUs involved, the post-hunt population estimate, and the
sex ratio (buck:doe, bull:cow, etc. -- same "per 100 females" shape
either way). Unlike the Draw Odds reports, these are small, genuinely
linear single-page tables -- `Docs/extraction/parse_herd_population.py`
just walks the extracted text line by line (no coordinate
reconstruction needed), adapting per row to whichever of these the
report happens to do that year or species:
- Herd name column present or absent (Deer 2019/2020/2025 omit it;
  Elk omits it in every year seen so far -- the column header prints,
  it's just never actually filled in).
- `Total Statewide Estimate` appearing before or after the DAU rows,
  and followed by 1 number (estimate only) or 2 (estimate + statewide
  ratio).
- DAU numbers bare (`1`) vs. zero-padded (`01`) -- normalized to
  2-digit by `scripts/import_herd_population.js` on import so the same
  DAU joins into one series across years instead of silently splitting
  into two (this bit Deer the first time through: DAU `1` and `01`
  were landing as different rows until the normalization was added).
- The "GAME MANAGEMENT UNITS" header is sometimes misspelled "GAME
  MANAGEMENT UNITES" (several Elk years) -- matched without the
  trailing S so either spelling works.
- Elk's reports also have a trailing non-DAU row -- "99 / [Statewide
  Unmanaged /] eastern plains units not in a DAU" -- a catch-all for
  GMUs with no real DAU, with a free-text description instead of a GMU
  list and an inconsistent number of trailing fields across years (0,
  1, or 2). Detected by the distinctive phrase "not in a DAU" (not the
  DAU number, in case another species' report files it under a
  different one) and skipped rather than guessed at.

**Two files (`2022DeerPopulationEstimates.pdf`,
`2022ElkPopulationEstimates.pdf`) resisted all of this.** Both use an
embedded Type3 font with no usable character mapping, so
`page.get_text()` comes back as garbage bytes no matter what -- not a
parsing bug to fix, just an unextractable PDF (apparently whatever
produced CPW's 2022 editions specifically had this problem across
species). Their data (`population_deer_2022.jsonl`,
`population_elk_2022.jsonl`) was transcribed by hand from the rendered
page image instead, then cross-checked field-by-field against the
adjacent year's parsed output (DAU boundaries usually don't change
year to year, so herd name and GMU list should match row for row) --
for Elk this caught two real transcription typos ("Loqwer Rio Grande"
-> "Lower Rio Grande", an inconsistent slash-spacing in "Rangely/Blue
Mountain") before trusting it. One flagged mismatch (DAU 43: "East
Gunnison Basin" in 2022 vs. "Fossil Ridge" in 2021/2023, same GMUs)
was re-verified against the rendered image and kept as-is -- a genuine
alternate name CPW used that one year, not a transcription error.

**DAU numbers are not stable identifiers across years, or comparable
across species.** Deer DAU `01` and Elk DAU `01` are unrelated herds
that happen to share a number -- that's what `Species` in the table's
key is for. Within a species, CPW also restructures DAU boundaries
periodically: Deer's old DAUs 21 (West Elk), 22 (Taylor River) and 25
(Powderhorn) merged into new DAU 57 (Gunnison Basin) in 2024; old 31
(Costilla) and 37 (Sand Dunes) merged into new DAU 56 (Sand Dunes).
Reports published after that change use the new numbering retroactively
(even Deer's 2023 report, published May 2024, already uses DAU 56/57).
This app doesn't try to reconcile old and new DAU numbers into one
continuous series; `HerdPopulationEstimates` just stores exactly what
each year's report says, so selecting an old, now-retired DAU number
in the Herd tab correctly shows only the years it existed under that
number, and a new DAU correctly shows only the years since it was
created. Don't assume a given species has no such restructuring just
because it isn't documented here yet -- check for DAU-count or
herd-name discontinuities between adjacent years before trusting a
"continuous" series.

To add a new species or year:

1. Drop the new report PDF in `Docs/`.
2. Check it extracts cleanly first: `python -c "import pymupdf;
   print(pymupdf.open('Docs/<file>.pdf')[0].get_text()[:500])"` -- if it
   comes back readable, proceed to step 3; if it's garbled like both
   2022 editions were, render the page (`page.get_pixmap(dpi=200)`)
   and transcribe by hand into the same JSON-per-line shape (see
   `population_elk_2022.jsonl` for the exact field names), ideally
   cross-checked against an adjacent year's DAU/herd-name/GMU list the
   way both 2022 editions were.
3. `python Docs/extraction/parse_herd_population.py "Docs/<file>.pdf"
   <species> <year> Docs/extraction/population_<species>_<year>.jsonl`
4. Add the species (with its full year list) to `SPECIES_YEARS` in
   `scripts/import_herd_population.js`, then
   `node scripts/import_herd_population.js` -- safe to re-run; upserts
   on (SeasonYear, Species, DAU) and never touches TagQuota.
5. Add the species to `SPECIES_META`/`SPECIES_ORDER` in
   `frontend/src/HerdTab.tsx` if it isn't already there (Pronghorn and
   Bear are pre-added with sensible ratio-label text, ready for data --
   the species tab row in the UI only shows species that actually have
   rows, so adding a species here ahead of its data existing is
   harmless).

### Tag quota (the Population chart's second bar)

`TagQuota` comes from a different source than the population PDFs
above: each DAU's GMUs' **primary draw** hunt-code quotas, summed. It's
only populated for species/years where a matching Post Draw Report PDF
has been provided (Deer and Elk 2021-2025 so far) -- years or species
without one simply show no second bar, same as any other missing-data
gap elsewhere in this app.

This reuses `Docs/extraction/parse_deer_recap.py` (the same script Draw
Odds' preference-points data comes from, for every species -- despite
the filename, it's species-generic; see "Updating Draw Odds data"
above), extended to also pull each hunt code's "Total Quota Amount"
(top-left red box, printed just above "Remaining Balance") via a
`find_total_quota()` function. That change is purely additive -- it
doesn't touch the existing `huntCode`/`list`/`status` extraction, and
was regression-tested by re-running it against already-committed,
already-validated output (Deer 2025 the first time, Deer 2025 again
plus Elk's existing 2026 Draw Odds data the second time) and diffing
every field except the new `totalQuota` one (zero differences) before
trusting it on new years.

To add a species/year:

1. Drop the year's Primary Post Draw Report PDF in `Docs/`.
2. `python Docs/extraction/parse_deer_recap.py "Docs/<file>.pdf"
   <species> primary <year>
   Docs/extraction/draw_points_<species>_primary_<year>.jsonl` -- same
   parser Draw Odds uses; sanity-check the printed "Parsed N hunt code
   pages" line against the PDF's own "Total Hunt Codes" number on its
   first page. A handful of hunt codes short is normal and doesn't
   meaningfully move a DAU-level sum (Deer 2021/2022 each land 5
   short; Elk 2023-2025 matched exactly) -- but Elk's 2021 and 2022
   reports land ~140 hunt codes short (887/1028 and 863/1004), a much
   bigger gap than any other year/species seen so far. Traced partway:
   those two years' reports split some hunt codes' applicant-breakdown
   tables onto a second, boxless continuation page (which is harmless
   -- `parse_deer_recap.py` correctly ignores those, since they have no
   "Hunt Code" box of their own to match), but that alone doesn't
   account for the full gap, and what does wasn't run down further
   given the size of this undertaking already. Treat Elk 2021/2022
   quota totals as directionally useful, not exact, more so than any
   other year covered.
3. Run `node scripts/import_herd_population.js` first if the matching
   species/year's population data isn't imported yet (the quota
   importer reads each DAU's GMU membership back from
   `HerdPopulationEstimates`, so it has to exist first), then `node
   scripts/import_herd_tag_quotas.js` -- recomputes and overwrites
   `TagQuota` for every species/year it has a
   `draw_points_<species>_primary_*.jsonl` file for; safe to re-run.
4. Add the species (with its year list) to `SPECIES_YEARS` in
   `scripts/import_herd_tag_quotas.js` if it isn't already there.

**This is primary-draw quota only** -- it doesn't include secondary
draw or leftover/OTC tags, so it understates total tags issued for
units that sell a meaningful number of those (the UI labels it
"primary draw tag quota" for this reason, not just "tags"). Extending
it to the fuller picture would mean also parsing a secondary-draw
report and a leftover/OTC sales source, neither of which exists in
`Docs/` yet.

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
- **Draw Odds now has data for all four tracked species** -- Deer,
  Pronghorn, Bear and Elk. GMU/Sex/Method are decoded from each hunt
  code itself (8 characters, self-describing -- see the Big Game
  brochure's "Hunt codes contain a lot of information" page), not
  looked up from a separate table, so a hunt code from *any* source
  shows up correctly filterable/sortable the moment it's imported.
- **`HuntCodeHarvestStats.HuntCode` is de-asterisked, matching
  `HuntCodeDrawPoints.HuntCode` exactly.** The harvest report prints a
  trailing `*` on "few responses" hunt codes (e.g. `DM002O1M*`) --
  early on, `scripts/import_hunt_codes.js` stored that raw string
  straight into `HuntCode` instead of using the already-decoded,
  de-asterisked `code`, even though `FewResponses` already exists
  specifically to carry that flag. The practical effect: a hunt code
  with low harvest-survey responses never matched its own draw-points
  row in the Draw Odds view -- `AllCodes`'s UNION saw `'DM002O1M*'` and
  `'DM002O1M'` as two different hunt codes, so it rendered as two
  partial rows (one with harvest and blank draw points, one with draw
  points and blank harvest) instead of one complete one. Affected
  ~17% of Deer and ~14% of Elk harvest rows -- found while adding Elk
  (it's a lot more visually obvious at >100 split rows than at a few
  dozen) and fixed retroactively for Deer and Bear too, not just the
  newly-added Elk data.
- **Bear's harvest "Hunters" column is really "Total Licenses Sold"**,
  not unique hunters who actually went afield -- that's the column CPW
  publishes for bear (unlike deer/pronghorn's draw-limited "Total
  Hunters"), and bear licenses are sold far more broadly (OTC/add-on,
  not just limited draw), so it's normal for this number to run much
  higher than Total Rec. Days for the same hunt code. Use Rec. Days for
  pressure, the same guidance as every other species -- don't read
  Hunters as a pressure indicator for bear.
- **`BP99999P` is a real CPW placeholder hunt code**, not a parsing
  artifact -- it appears in the Deer, Pronghorn and Bear draw-points
  reports alike, representing applicants who applied only to bank a
  preference point rather than for any real unit (0 quota, "None
  Drawn" across every category). It decodes to a nonsense GMU (999)
  since the hunt-code format doesn't special-case it, so it sorts to
  the bottom of a GMU-sorted view -- harmless, but worth recognizing
  if you spot it.
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
- **The Herd tab's bar/line charts are hand-rolled SVG, not a charting
  library.** Each DAU has at most 7 data points -- not enough to
  justify a new frontend dependency in an app that otherwise has none
  (just React) -- so `HerdTab.tsx` computes its own linear scales and
  draws `<rect>`/`<polyline>` elements directly.
- **The Herd tab defaults to whichever DAU contains GMU 109** within
  the currently selected species (falling back to the lowest-numbered
  DAU for that species if 109 isn't in any of its DAUs -- Elk's DAUs
  don't happen to include it, for instance), the same personalization
  the Home tab's Whitetail column and the Draw Odds/Walk-In tabs'
  first-pass data both lean on. Switching species resets both the
  search box and the selected DAU to that species' own default, since
  DAU numbers aren't comparable across species.
- **The Herd tab's species tabs only show species that actually have
  rows** -- `SPECIES_META`/`SPECIES_ORDER` in `HerdTab.tsx` can (and
  do) list Pronghorn/Bear ahead of their data existing with no visual
  effect, so adding a species there is safe to do before its PDFs are.
- **`HerdPopulationEstimates.TagQuota` covers 2021-2025 for the
  species that have it (Deer, Elk), not the full year range the
  population/ratio data has.** It comes from a different source
  (summed *primary draw* hunt-code quotas from each year's Post Draw
  Report, via `scripts/import_herd_tag_quotas.js`) than the population
  PDFs, and some species/years don't have an equivalent report in
  `Docs/` yet -- those just show no second bar in the Population
  chart, the same as any other missing-data gap elsewhere in this app.
  It's also primary-draw-only (no secondary draw or leftover/OTC), so
  treat it as a lower bound on tags issued, not the complete count --
  see "Updating Herd data" above.
