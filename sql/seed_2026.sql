-- 2026 season data for the Home tab dashboard.
-- Source: Docs/2026-Colorado Big Game Hunting Brochure.pdf and
--         Docs/Colorado Small Game & Waterfowl Brochure.pdf
-- (CPW "At a Glance -- Important Dates," "Season Dates" and per-species
-- "Season Dates & Bag Limits" pages). Re-run this file each year with the
-- new brochure's numbers -- it clears 2026 rows first, so it's safe to
-- run more than once.

DELETE FROM DrawDates WHERE SeasonYear = 2026;
DELETE FROM BigGameSeasonDates WHERE SeasonYear = 2026;
DELETE FROM SmallGameSeasonDates WHERE SeasonYear = 2026;

-- One-time rename (deer split into Mule Deer + Whitetail columns): if an
-- older 'deer' row exists, fold it into 'mule_deer' so its SpeciesID (and
-- any FK-linked rows) carry over instead of orphaning.
UPDATE Species SET SpeciesKey = 'mule_deer' WHERE SpeciesKey = 'deer';

INSERT INTO Species (SpeciesKey, DisplayName, Category, SortOrder) VALUES
    ('mule_deer',         'Mule Deer',          'big_game',   1),
    ('whitetail_deer',    'Whitetail',          'big_game',   2),
    ('elk',               'Elk',                'big_game',   3),
    ('pronghorn',         'Pronghorn',          'big_game',   4),
    ('bear',              'Bear',               'big_game',   5),
    ('rabbit',            'Rabbit',             'small_game', 1),
    ('dove',              'Dove',               'small_game', 2),
    ('blue_grouse',       'Blue Grouse',        'small_game', 3),
    ('sage_grouse',       'Sage Grouse',        'small_game', 4),
    ('sharptail_grouse',  'Sharp-Tail Grouse',  'small_game', 5),
    ('pheasant',          'Pheasant',           'small_game', 6)
ON CONFLICT(SpeciesKey) DO UPDATE SET
    DisplayName = excluded.DisplayName,
    Category    = excluded.Category,
    SortOrder   = excluded.SortOrder;

-- ─── Draw Dates (shared across deer/elk/pronghorn -- see schema.sql note) ───

INSERT INTO DrawDates (SeasonYear, DrawType, EventKey, EventLabel, DisplayText, SortOrder, Notes) VALUES
    (2026, 'primary',   'applications_open',   'Applications Open',          'March 1',                 1, NULL),
    (2026, 'primary',   'application_deadline','Application Deadline',       'April 7, 8 p.m. MT',      2, NULL),
    (2026, 'primary',   'draw_results',        'Draw Results Posted',        'May 26-29',               3, NULL),
    (2026, 'primary',   'surrender_deadline',  'Surrender Deadline',         'June 1, 11:59 p.m. MT',   4, NULL),
    (2026, 'primary',   'payment_deadline',    'License Payment Deadline',   'June 12, 11:59 p.m. MT',  5, NULL),
    (2026, 'primary',   'licenses_mailed',     'Licenses in the Mail',       'June 26',                 6, NULL),

    (2026, 'secondary', 'applications_open',   'Applications Open',          'June 18',                 1, NULL),
    (2026, 'secondary', 'application_deadline','Application Deadline',       'June 30, 8 p.m. MT',      2, NULL),
    (2026, 'secondary', 'draw_results',        'Draw Results Posted',        'July 7',                  3, NULL),
    (2026, 'secondary', 'surrender_deadline',  'Surrender Deadline',         'July 9, 11:59 p.m. MT',   4, NULL),
    (2026, 'secondary', 'payment_deadline',    'License Payment Deadline',   'July 21, 11:59 p.m. MT',  5, NULL),
    (2026, 'secondary', 'licenses_mailed',     'Licenses in the Mail',       'July 27',                 6, NULL),
    (2026, 'secondary', 'leftover_otc_sale',   'Leftover/OTC Licenses On Sale', 'Aug. 4, 9 a.m. MT',     7,
        'Includes OTC add-on bear licenses and remaining leftover limited licenses.');

-- ─── Big Game Season Dates ───

INSERT INTO BigGameSeasonDates (SeasonYear, SpeciesID, MethodKey, MethodLabel, DisplayText, SortOrder, Notes) VALUES
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'mule_deer'), 'archery',      'Archery',       'Sept. 2-30*',      1, '*Unless otherwise noted in the hunt code tables.'),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'mule_deer'), 'muzzleloader', 'Muzzleloader',  'Sept. 12-20*',     2, '*Unless otherwise noted in the hunt code tables.'),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'mule_deer'), 'rifle_1',      'First Rifle',   'Oct. 14-18**',     3, '**In select GMUs. See the rifle hunt code tables.'),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'mule_deer'), 'rifle_2',      'Second Rifle',  'Oct. 24-Nov. 1',   4, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'mule_deer'), 'rifle_3',      'Third Rifle',   'Nov. 7-15',        5, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'mule_deer'), 'rifle_4',      'Fourth Rifle',  'Nov. 18-22',       6, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'mule_deer'), 'plains_rifle', 'Plains Rifle',  'Oct. 24-Nov. 3',   7, 'Deer only.'),

    -- Whitetail season dates vary significantly by GMU (unlike mule deer's
    -- fairly uniform statewide season), so there's no single "statewide
    -- whitetail" date to show. These are GMU 103 (Plains) as a
    -- representative eastern-plains example, per hunt code tables pages
    -- 24 (archery), 26 (muzzleloader) and 30 (rifle).
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'whitetail_deer'), 'archery', 'Archery',
        'Oct. 1-23' || char(10) || 'Nov. 4-30' || char(10) || 'Dec. 15-31', 1,
        'GMU 103 (Plains) example -- hunt code D-E-103-O1-A, List A. Three split season windows; varies by unit.'),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'whitetail_deer'), 'muzzleloader', 'Muzzleloader',
        'Oct. 10-18', 2,
        'GMU 103 (Plains) example -- hunt codes D-M/D-F-103-O2-M, List A.'),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'whitetail_deer'), 'plains_rifle', 'Plains Rifle',
        'Oct. 24-Nov. 3', 3,
        'GMU 103 (Plains) example -- hunt codes D-M/D-F-103-O1-R, List A.'),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'whitetail_deer'), 'late_rifle', 'Late Rifle',
        'Dec. 1-14', 4,
        'GMU 103 (Plains) example -- hunt codes D-M/D-F-103-L1-R, List A.'),

    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'elk'), 'archery',      'Archery',       'Sept. 2-30',       1, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'elk'), 'muzzleloader', 'Muzzleloader',  'Sept. 12-20',      2, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'elk'), 'rifle_1',      'First Rifle',   'Oct. 14-18',       3, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'elk'), 'rifle_2',      'Second Rifle',  'Oct. 24-Nov. 1',   4, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'elk'), 'rifle_3',      'Third Rifle',   'Nov. 7-15',        5, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'elk'), 'rifle_4',      'Fourth Rifle',  'Nov. 18-22',       6, NULL),

    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'pronghorn'), 'archery',      'Archery',      'Aug. 15-Sept. 20*', 1, '*Unless otherwise noted in the brochure tables.'),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'pronghorn'), 'muzzleloader', 'Muzzleloader', 'Sept. 21-29',       2, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'pronghorn'), 'rifle',        'Rifle',        'Oct. 3-11*',        3, '*General dates -- early/late rifle season dates vary by hunt code. See hunt code tables, brochure pages 56-57.'),

    -- Bear is legal game during deer/elk's 1st-4th rifle seasons (same
    -- dates -- "The first rifle season is limited to deer, elk and bear
    -- hunting only. The second, third and fourth rifle seasons are for
    -- elk, bear and deer hunters"), plus its own early-September
    -- private-land-only rifle season.
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'bear'), 'archery',      'Archery',       'Sept. 2-30*',     1, '*Unless otherwise noted in the hunt code tables.'),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'bear'), 'muzzleloader', 'Muzzleloader',  'Sept. 12-20*',    2, '*Unless otherwise noted in the hunt code tables.'),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'bear'), 'sept_rifle',   'Sept. Rifle',   'Sept. 2-30*',     3, 'Private-land-only, GMUs 3, 11, 211 & 301. *Unless otherwise noted in the hunt code tables.'),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'bear'), 'rifle_1',      'First Rifle',   'Oct. 14-18',      4, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'bear'), 'rifle_2',      'Second Rifle',  'Oct. 24-Nov. 1',  5, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'bear'), 'rifle_3',      'Third Rifle',   'Nov. 7-15',       6, NULL),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'bear'), 'rifle_4',      'Fourth Rifle',  'Nov. 18-22',      7, NULL);

-- ─── Small Game: Season Dates & Bag/Possession Limits ───

INSERT INTO SmallGameSeasonDates (SeasonYear, SpeciesID, SeasonLabel, DisplayText, DailyBagLimit, PossessionLimit, AreaNote, SortOrder) VALUES
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'rabbit'), 'Season',
        'Oct. 1 - end of Feb., annually', '10 of each species', '20 of each species', 'Statewide', 1),

    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'dove'), 'Season',
        'Sept. 1 - Nov. 29, annually', '15 singly or in aggregate', '45 singly or in aggregate', 'Statewide', 1),

    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'blue_grouse'), 'Season',
        'Sept. 1 - Nov. 22, 2026', '3', '9', 'West of I-25', 1),

    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'sage_grouse'), 'Season 1 (Regular)',
        'Sept. 12-18, 2026', '2', '4', 'GMUs 2,3,4,5,10,11,13,18(pt),27,28(pt),37,181,201,211,301,441', 1),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'sage_grouse'), 'Season 2 (North Park)',
        'Sept. 12-13, 2026', '2', '2', 'GMUs 6,16,17,161,171', 2),

    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'sharptail_grouse'), 'Season',
        'Sept. 1-20, 2026', '2', '4', 'GMUs 4,5,12,13,14,23,131,211,214,441', 1),

    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'pheasant'), 'Season 1 (East of I-25)',
        'Nov. 14, 2026 - Jan. 31, 2027', '3 cocks', '9 cocks', 'East of I-25', 1),
    (2026, (SELECT SpeciesID FROM Species WHERE SpeciesKey = 'pheasant'), 'Season 2 (West of I-25)',
        'Nov. 14, 2026 - Jan. 3, 2027', '3 cocks', '9 cocks', 'West of I-25', 2);
