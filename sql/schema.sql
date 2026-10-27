-- Hunt Notes schema
--
-- Covers what the Home tab dashboard needs today (draw calendar + season
-- dates for the tracked species) plus the Species table that future tabs
-- (hunt logs, GMU research, notes) will key off of.

CREATE TABLE IF NOT EXISTS Species (
    SpeciesID   INTEGER PRIMARY KEY,
    SpeciesKey  TEXT NOT NULL UNIQUE,              -- stable key, e.g. 'deer', 'sage_grouse'
    DisplayName TEXT NOT NULL,                     -- e.g. 'Deer', 'Sage Grouse'
    Category    TEXT NOT NULL CHECK (Category IN ('big_game', 'small_game')),
    SortOrder   INTEGER NOT NULL
);

-- Colorado runs ONE unified primary/secondary draw application process for
-- deer, elk, pronghorn and bear (and moose, which this app doesn't track) --
-- the application/payment/results dates are identical across those species,
-- so this table is intentionally NOT scoped by species. The Home tab shows
-- this same calendar once per big-game species column.
CREATE TABLE IF NOT EXISTS DrawDates (
    DrawDateID  INTEGER PRIMARY KEY,
    SeasonYear  INTEGER NOT NULL,
    DrawType    TEXT NOT NULL CHECK (DrawType IN ('primary', 'secondary')),
    EventKey    TEXT NOT NULL,                     -- stable key, e.g. 'application_deadline'
    EventLabel  TEXT NOT NULL,                     -- e.g. 'Application Deadline'
    DisplayText TEXT NOT NULL,                     -- human text as published, e.g. 'April 7, 8 p.m. MT'
    SortOrder   INTEGER NOT NULL,
    Notes       TEXT,
    UNIQUE (SeasonYear, DrawType, EventKey)
);

-- Per-species season dates for big game (deer/elk/pronghorn). MethodKey rows
-- that don't apply to a species (e.g. pronghorn has no 'Fourth Rifle') are
-- simply absent for that species -- the UI renders a blank cell.
CREATE TABLE IF NOT EXISTS BigGameSeasonDates (
    SeasonDateID INTEGER PRIMARY KEY,
    SeasonYear   INTEGER NOT NULL,
    SpeciesID    INTEGER NOT NULL REFERENCES Species(SpeciesID),
    MethodKey    TEXT NOT NULL,                    -- 'archery', 'muzzleloader', 'rifle_1' .. 'rifle_4', 'plains_rifle'
    MethodLabel  TEXT NOT NULL,                    -- e.g. 'First Rifle'
    DisplayText  TEXT NOT NULL,                    -- e.g. 'Oct. 14-18'
    SortOrder    INTEGER NOT NULL,
    Notes        TEXT,
    UNIQUE (SeasonYear, SpeciesID, MethodKey)
);

-- Small game season/bag/possession. A species can have more than one season
-- window in a year (e.g. sage grouse has a regular + North Park season,
-- pheasant has an east/west split) -- each gets its own row, ordered by
-- SortOrder, and the UI stacks them within that species' column.
CREATE TABLE IF NOT EXISTS SmallGameSeasonDates (
    SmallGameSeasonID INTEGER PRIMARY KEY,
    SeasonYear      INTEGER NOT NULL,
    SpeciesID       INTEGER NOT NULL REFERENCES Species(SpeciesID),
    SeasonLabel     TEXT NOT NULL,                 -- e.g. 'Season' or 'Season 2 (North Park)'
    DisplayText     TEXT NOT NULL,                 -- date range as published
    DailyBagLimit   TEXT NOT NULL,                 -- text, not always numeric: '3 cocks', '15 singly or in aggregate'
    PossessionLimit TEXT NOT NULL,
    AreaNote        TEXT,                          -- e.g. 'West of I-25', 'East of I-25'
    SortOrder       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_BigGameSeasonDates_Species ON BigGameSeasonDates (SeasonYear, SpeciesID);
CREATE INDEX IF NOT EXISTS idx_SmallGameSeasonDates_Species ON SmallGameSeasonDates (SeasonYear, SpeciesID);

-- My Hunt tab: personal application tracking, one row per species per year.
--
-- SpeciesKey here is deliberately its own small CHECK-constrained list, not
-- a FK to Species. CPW allows exactly one "Deer" application per draw per
-- year -- mule deer vs. whitetail is just which GMU/hunt code you pick
-- within that one application, not two separate applications -- so this
-- table has a single combined 'deer' row, unlike the Home tab's Species
-- table, which splits mule_deer/whitetail_deer for season-date display.
--
-- Rows are created on demand (upserted) when the user edits a field, not
-- pre-seeded, so this table is never touched by sql/seed_2026.sql's
-- delete-and-reload-from-brochure pattern -- a schema re-init can never
-- wipe the user's own application data.
CREATE TABLE IF NOT EXISTS MyHuntPlans (
    MyHuntPlanID INTEGER PRIMARY KEY,
    SeasonYear   INTEGER NOT NULL,
    SpeciesKey   TEXT NOT NULL CHECK (SpeciesKey IN ('deer', 'elk', 'pronghorn', 'bear')),

    IsTargeted   INTEGER NOT NULL DEFAULT 0 CHECK (IsTargeted IN (0, 1)),
    HasApplied   INTEGER NOT NULL DEFAULT 0 CHECK (HasApplied IN (0, 1)),

    -- Manually entered -- CPW doesn't expose a lookup API, so this is
    -- whatever the user's last results letter/account page told them.
    -- Preference points are a primary-draw-only concept (the secondary
    -- draw doesn't use or award them), which is why it lives up here with
    -- Target/Applied rather than inside either draw section below.
    CurrentPreferencePoints INTEGER,

    -- Primary draw. CPW allows up to 4 ranked choices per application --
    -- this only tracks the first two.
    PrimaryChoice1HuntCode TEXT,
    PrimaryChoice2HuntCode TEXT,
    PrimaryDrawResult      TEXT NOT NULL DEFAULT 'pending'
        CHECK (PrimaryDrawResult IN ('pending', 'drawn', 'not_drawn')),
    PrimaryDrawnHuntCode   TEXT,                    -- hunt code actually drawn, if any

    -- Secondary draw.
    SecondaryChoiceHuntCode TEXT,
    SecondaryDrawResult     TEXT NOT NULL DEFAULT 'pending'
        CHECK (SecondaryDrawResult IN ('pending', 'drawn', 'not_drawn')),
    SecondaryDrawnHuntCode  TEXT,

    -- Leftover/OTC purchases live in MyHuntLeftoverPurchases below, not
    -- here -- see that table's comment for why.
    Notes     TEXT,
    UpdatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (SeasonYear, SpeciesKey)
);

-- Leftover/OTC tags held for a species in a year. This is a separate,
-- unbounded list rather than columns on MyHuntPlans because CPW's "one
-- license per species, per draw" limit applies only to the primary and
-- secondary DRAWS -- a Leftover/OTC purchase isn't a draw, and List A/B
-- hunts let you hold more than one tag for the same species in the same
-- year (e.g. a drawn List A archery tag plus a purchased List B rifle
-- tag in an adjacent unit -- or even two List B leftover purchases).
CREATE TABLE IF NOT EXISTS MyHuntLeftoverPurchases (
    MyHuntLeftoverPurchaseID INTEGER PRIMARY KEY,
    SeasonYear   INTEGER NOT NULL,
    SpeciesKey   TEXT NOT NULL CHECK (SpeciesKey IN ('deer', 'elk', 'pronghorn', 'bear')),
    HuntCode     TEXT,
    PurchaseDate TEXT,
    Notes        TEXT,
    CreatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_MyHuntLeftoverPurchases_Species ON MyHuntLeftoverPurchases (SeasonYear, SpeciesKey);

-- Access tab: public hunting-access properties (State Wildlife Areas, State
-- Trust Lands, and later State Parks/BLM/National Forest), sourced from the
-- CPW "State Recreation Lands" brochure (Docs/2026 Colorado State Recreation
-- Lands.pdf -- a scanned/image-only PDF, transcribed by hand page by page).
--
-- Species are a separate child table, not a comma list, because the user
-- wants "records for each species listed" (one row per species per area) so
-- the Access tab can filter/sort by species. Species names here are free
-- text as printed in the brochure ('dusky grouse', 'big game', 'waterfowl',
-- etc.) -- a much broader vocabulary than the Home/My Hunt tabs' curated
-- big-game list -- not a FK to the Species table.
CREATE TABLE IF NOT EXISTS AccessAreas (
    AccessAreaID INTEGER PRIMARY KEY,
    Name         TEXT NOT NULL,
    AreaType     TEXT NOT NULL CHECK (AreaType IN ('SWA', 'STL', 'State Park', 'SFU', 'BLM', 'National Forest')),
    County       TEXT,                              -- as printed, may list more than one county
    GMUs         TEXT,                               -- display text, e.g. '133, 134'
    PrimaryGMU   INTEGER,                             -- first/lowest GMU number, for sorting
    AcresTotal   REAL,
    DistanceFromDenverMiles INTEGER,                  -- estimated road miles -- not in the brochure
                                                       -- (it gives turn-by-turn directions instead),
                                                       -- approximated from the referenced town/highway.
    Recreation   TEXT,                                -- brochure text, e.g. 'hiking, wildlife viewing'
    Facilities   TEXT,                                -- brochure text, e.g. 'restrooms, boat ramps'
    CampingAllowed INTEGER NOT NULL DEFAULT 0 CHECK (CampingAllowed IN (0, 1)),
    Restrictions TEXT,                                -- brochure-sourced reference rules (read-only)
    Notes        TEXT,                                -- the user's own notes -- restrictions/issues
                                                       -- they personally find, separate from the
                                                       -- brochure's own Restrictions text above.
    SourcePage   INTEGER,                             -- printed brochure page number, for traceability
    CreatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (Name, AreaType)
);

CREATE TABLE IF NOT EXISTS AccessAreaSpecies (
    AccessAreaSpeciesID INTEGER PRIMARY KEY,
    AccessAreaID INTEGER NOT NULL REFERENCES AccessAreas(AccessAreaID) ON DELETE CASCADE,
    SpeciesName  TEXT NOT NULL,
    UNIQUE (AccessAreaID, SpeciesName)
);

CREATE INDEX IF NOT EXISTS idx_AccessAreas_Type ON AccessAreas (AreaType);
CREATE INDEX IF NOT EXISTS idx_AccessAreas_PrimaryGMU ON AccessAreas (PrimaryGMU);
CREATE INDEX IF NOT EXISTS idx_AccessAreas_Distance ON AccessAreas (DistanceFromDenverMiles);
CREATE INDEX IF NOT EXISTS idx_AccessAreaSpecies_Area ON AccessAreaSpecies (AccessAreaID);
CREATE INDEX IF NOT EXISTS idx_AccessAreaSpecies_Name ON AccessAreaSpecies (SpeciesName);

-- Draw Odds tab: statewide harvest stats + post-draw preference-points
-- data, both at the hunt-code level. Both are published by CPW as
-- scanned-free but absolute-positioned-text PDFs (table structure isn't
-- real PDF tables, just text boxes placed at coordinates) -- parsed with
-- coordinate-clustering scripts in Docs/extraction/*.py, not pdftotext's
-- column-alignment heuristics (which badly scrambles these reports' rows).
-- See README's "Updating Draw Odds data" section.
--
-- Hunt codes are 8 characters and self-describing (species/sex/GMU/season/
-- method) -- see the Big Game brochure's "Hunt codes contain a lot of
-- information" page. GMU, Sex and Method are decoded from the code itself
-- at import time so they're directly filterable/sortable without
-- re-parsing in every query.

-- One row per hunt code per year: statewide harvest survey results.
-- Antlered/Antlerless/Young correspond to the report's Bucks/Does/Fawns
-- (deer, pronghorn) or Bulls/Cows/Calves (elk) columns -- named generically
-- since the sex terms differ by species.
CREATE TABLE IF NOT EXISTS HuntCodeHarvestStats (
    HuntCodeHarvestStatID INTEGER PRIMARY KEY,
    SeasonYear      INTEGER NOT NULL,
    Species         TEXT NOT NULL CHECK (Species IN ('deer', 'elk', 'pronghorn', 'bear')),
    HuntCode        TEXT NOT NULL,             -- de-asterisked, e.g. 'DM002O1M' -- the report prints a trailing
                                                 -- '*' for few-responses codes, but that's tracked by FewResponses
                                                 -- below instead, so this matches HuntCodeDrawPoints.HuntCode
                                                 -- exactly and the two tables actually join on the same key
    GMU             INTEGER,                    -- decoded from HuntCode chars 3-5
    Sex             TEXT,                       -- decoded from HuntCode char 2: M/F/E
    Method          TEXT,                       -- decoded from HuntCode char 8: A/M/R/X
    SeasonCode      TEXT,                       -- decoded from HuntCode chars 6-7, e.g. 'O1'
    AntleredCount   INTEGER,
    AntlerlessCount INTEGER,
    YoungCount      INTEGER,
    TotalHarvest    INTEGER,
    TotalHunters    INTEGER,
    PercentSuccess  REAL,                       -- e.g. 45.5 (not 0.455)
    TotalRecDays    INTEGER,
    FewResponses    INTEGER NOT NULL DEFAULT 0 CHECK (FewResponses IN (0, 1)),
    UNIQUE (SeasonYear, Species, HuntCode)
);

-- One row per hunt code per year per draw type: how many preference
-- points (or Choice N / Leftover / No Apps / None Drawn / N/A) it took to
-- draw, broken out by the 6 applicant categories CPW reports. *Status is
-- the full text as published (kept verbatim since "Choice 2" and
-- "Leftover Choice 1" aren't reducible to a point count); *Points is the
-- parsed-out number when the status is "N Pref Points", else NULL, so the
-- UI can sort/filter numerically without parsing text at query time.
CREATE TABLE IF NOT EXISTS HuntCodeDrawPoints (
    HuntCodeDrawPointID INTEGER PRIMARY KEY,
    SeasonYear  INTEGER NOT NULL,
    Species     TEXT NOT NULL CHECK (Species IN ('deer', 'elk', 'pronghorn', 'bear')),
    DrawType    TEXT NOT NULL CHECK (DrawType IN ('primary', 'secondary')),
    HuntCode    TEXT NOT NULL,
    GMU         INTEGER,
    Sex         TEXT,
    Method      TEXT,
    SeasonCode  TEXT,
    List        TEXT,                          -- A/B/C

    AdultResStatus    TEXT,
    AdultResPoints    INTEGER,
    AdultNonResStatus TEXT,
    AdultNonResPoints INTEGER,
    YouthResStatus    TEXT,
    YouthResPoints    INTEGER,
    YouthNonResStatus TEXT,
    YouthNonResPoints INTEGER,
    LandownerUnrestrictedStatus TEXT,
    LandownerRestrictedStatus   TEXT,

    UNIQUE (SeasonYear, Species, DrawType, HuntCode)
);

CREATE INDEX IF NOT EXISTS idx_HuntCodeHarvestStats_GMU ON HuntCodeHarvestStats (SeasonYear, Species, GMU);
CREATE INDEX IF NOT EXISTS idx_HuntCodeHarvestStats_Code ON HuntCodeHarvestStats (HuntCode);
CREATE INDEX IF NOT EXISTS idx_HuntCodeDrawPoints_GMU ON HuntCodeDrawPoints (SeasonYear, Species, DrawType, GMU);
CREATE INDEX IF NOT EXISTS idx_HuntCodeDrawPoints_Code ON HuntCodeDrawPoints (HuntCode);

-- Walk-In Atlas tab: free public hunting access on private land enrolled in
-- CPW's Walk-In Access (WIA) program. Unlike the brochures above, the
-- atlas has no per-property text at all -- it's pages of maps (one raster
-- image per county half, no text layer over the parcels), each shaded
-- parcel showing only a land-type letter (G/C/W/O) and a color (yellow =
-- open to big game + small game, white = small game only). There's no
-- name, address or acreage printed per parcel -- Slug/Label/Locator below
-- are this app's own invention (a stable key + a human-readable
-- description good enough to relocate the parcel in the atlas or onX),
-- not brochure text. See README's "Updating Walk-In Atlas data" section.
-- GMU 103/109 (the first pass) are one row per individual shaded shape;
-- everywhere else, a row is a *cluster* of same-type adjoining shapes near
-- one landmark (ParcelCount holds the approximate shape count) -- full
-- statewide coverage at one-row-per-shape wasn't tractable by hand.
CREATE TABLE IF NOT EXISTS WalkInAreas (
    WalkInAreaID INTEGER PRIMARY KEY,
    SeasonYear   INTEGER NOT NULL,                    -- atlas edition, e.g. 2026
    Slug         TEXT NOT NULL,                        -- stable id, e.g. 'yuma-109-kirk-1'
    Label        TEXT NOT NULL,                        -- short human label, e.g. 'N of Kirk (large)'
    County       TEXT NOT NULL,
    GMU          INTEGER,                                -- null on the handful of western-slope pages that don't overlay GMU lines
    BigGame      INTEGER NOT NULL DEFAULT 0 CHECK (BigGame IN (0, 1)),  -- yellow on the map; 0 = white (small game only)
    LandType     TEXT,                                 -- 'Grass' | 'Corn' | 'Wheat' | 'Other', from the map's G/C/W/O letter
    ParcelCount  INTEGER NOT NULL DEFAULT 1,            -- adjoining same-type shapes this row groups together (see README)
    Locator      TEXT,                                 -- approximate township/range and/or nearest town, read off the map
    SourcePage   INTEGER,                               -- printed atlas page number, for traceability
    Owner        TEXT,                                 -- user-filled, e.g. from onX Hunt's landowner layer
    Notes        TEXT,                                 -- the user's own scouting notes
    Scouted      INTEGER NOT NULL DEFAULT 0 CHECK (Scouted IN (0, 1)),
    CreatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (SeasonYear, Slug)
);

CREATE INDEX IF NOT EXISTS idx_WalkInAreas_GMU ON WalkInAreas (SeasonYear, GMU);
CREATE INDEX IF NOT EXISTS idx_WalkInAreas_County ON WalkInAreas (County);

-- Herd tab: CPW's annual "Post Hunt Population & Sex Ratio Estimates"
-- (Deer), one row per DAU (Data Analysis Unit -- a group of GMUs CPW
-- manages as one herd) per year. Source PDFs are small, genuinely linear
-- single-page tables -- see Docs/extraction/parse_deer_population.py and
-- README's "Updating Herd data" section.
--
-- DAU is kept as published TEXT, not an integer, and is NOT a stable
-- identifier across years -- CPW restructured several DAUs in 2024 (old
-- DAUs 21/22/25 merged into new DAU 57; old 31/37 merged into new 56), so
-- a given DAU number can have data for only part of the 2019-2025 range.
-- This table doesn't attempt to reconcile old/new DAU numbers into one
-- continuous series -- it stores exactly what each year's report says,
-- and the UI shows whatever years exist for the DAU selected.
--
-- HerdName is nullable because the 2019/2020/2025 reports don't include
-- it (DAU number + GMU list only). GMUs is published display text (e.g.
-- '103, 109, 116, 117'), not normalized -- same reasoning as AccessAreas.GMUs.
--
-- TagQuota is nullable -- it's a different source than this table's own
-- PDFs (summed PRIMARY DRAW hunt-code quotas from a post-draw report, via
-- scripts/import_deer_tag_quotas.js), so it's only populated for years
-- that report exists for (2021-2025 so far, not 2019/2020). It also
-- doesn't include secondary draw or leftover/OTC tags -- see README.
CREATE TABLE IF NOT EXISTS DeerPopulationEstimates (
    PopulationEstimateID INTEGER PRIMARY KEY,
    SeasonYear         INTEGER NOT NULL,
    DAU                TEXT NOT NULL,              -- as published, e.g. '47' -- not stable across years, see above
    HerdName           TEXT,                        -- e.g. 'South Republican' -- absent in some years' reports
    GMUs               TEXT NOT NULL,               -- display text, e.g. '103, 109, 116, 117'
    PopulationEstimate INTEGER NOT NULL,
    BuckDoeRatio       INTEGER,                      -- per 100 does
    TagQuota           INTEGER,                      -- summed PRIMARY DRAW quota across the DAU's GMUs, see above
    UNIQUE (SeasonYear, DAU)
);

CREATE INDEX IF NOT EXISTS idx_DeerPopulationEstimates_DAU ON DeerPopulationEstimates (DAU);
