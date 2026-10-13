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
-- deer, elk and pronghorn (and bear/moose, which this app doesn't track) --
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
