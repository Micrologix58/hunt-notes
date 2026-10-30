import { useEffect, useMemo, useState } from "react";
import { fetchHerdPopulation, type HerdPopulationRow, type HerdSpecies } from "./services/herdPopulationApi";
import { fetchBearGmuStats, type BearGmuStatsRow } from "./services/bearGmuStatsApi";

type DauKey = {
    dau: string;
    herdName: string | null;
    gmus: string;
    years: HerdPopulationRow[];
};

type GmuKey = {
    gmu: number;
    years: BearGmuStatsRow[];
};

// Order controls the species-tab display order; label/sexRatioLabel are
// generic enough to cover each species' terminology (CPW's ratio column is
// "Buck/Doe" for deer, "Bull/Cow" for elk, etc., but it's always the same
// "males per 100 females" shape) without hardcoding one species' wording
// into the chart components.
const SPECIES_META: Record<HerdSpecies, { label: string; sexRatioLabel: string; maleTerm: string }> = {
    deer: { label: "Deer", sexRatioLabel: "Buck/Doe Ratio (per 100 does)", maleTerm: "buck" },
    elk: { label: "Elk", sexRatioLabel: "Bull/Cow Ratio (per 100 cows)", maleTerm: "bull" },
    pronghorn: { label: "Pronghorn", sexRatioLabel: "Buck/Doe Ratio (per 100 does)", maleTerm: "buck" },
    bear: { label: "Bear", sexRatioLabel: "Sex Ratio (per 100 females)", maleTerm: "male" },
};
const SPECIES_ORDER: HerdSpecies[] = ["deer", "elk", "pronghorn", "bear"];

const panelStyle: React.CSSProperties = {
    background: "#141414", border: "1px solid #2a2a2a", borderRadius: 8,
    margin: "20px 24px", display: "flex", minHeight: 560, overflow: "hidden",
};
const keyColStyle: React.CSSProperties = {
    width: 300, flexShrink: 0, borderRight: "1px solid #2a2a2a",
    display: "flex", flexDirection: "column",
};
const chartColStyle: React.CSSProperties = { flex: 1, padding: "16px 24px", minWidth: 0, overflowX: "auto" };
const inputStyle: React.CSSProperties = {
    background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 4, color: "#e2e8f0",
    padding: "6px 8px", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};
const dauListStyle: React.CSSProperties = { flex: 1, overflowY: "auto" };
const dauRowStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid #1f1f1f",
    background: active ? "#1e3a5f" : "transparent",
});
const dauTitleStyle: React.CSSProperties = { color: "#e2e8f0", fontSize: 13, fontWeight: 600 };
const dauSubStyle: React.CSSProperties = { color: "#64748b", fontSize: 11, marginTop: 2 };
const speciesTabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit",
    background: active ? "#1e3a5f" : "transparent", color: active ? "#e2e8f0" : "#64748b",
    border: "none", borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent", fontWeight: active ? 600 : 400,
});

function parseDauNum(dau: string): number {
    return parseInt(dau, 10);
}

function buildDauKeys(rows: HerdPopulationRow[], species: HerdSpecies): DauKey[] {
    const byDau = new Map<string, HerdPopulationRow[]>();
    for (const r of rows) {
        if (r.species !== species) continue;
        const arr = byDau.get(r.dau) ?? [];
        arr.push(r);
        byDau.set(r.dau, arr);
    }
    const keys: DauKey[] = [];
    for (const [dau, years] of byDau) {
        years.sort((a, b) => a.seasonYear - b.seasonYear);
        const latest = years[years.length - 1];
        // Herd names are static, just missing from a couple of report
        // editions (Deer 2019/2020/2025; Elk every year so far) -- fall
        // back to the most recent year that *did* print one rather than
        // showing blank for a DAU whose latest year happens to omit it
        // (e.g. Deer DAU 47 has a name in 2021-2024 but 2025 omitted the
        // column again).
        const namedYear = [...years].reverse().find(y => y.herdName != null);
        keys.push({ dau, herdName: namedYear?.herdName ?? null, gmus: latest.gmus, years });
    }
    keys.sort((a, b) => parseDauNum(a.dau) - parseDauNum(b.dau));
    return keys;
}

function buildGmuKeys(rows: BearGmuStatsRow[]): GmuKey[] {
    const byGmu = new Map<number, BearGmuStatsRow[]>();
    for (const r of rows) {
        const arr = byGmu.get(r.gmu) ?? [];
        arr.push(r);
        byGmu.set(r.gmu, arr);
    }
    const keys: GmuKey[] = [];
    for (const [gmu, years] of byGmu) {
        years.sort((a, b) => a.seasonYear - b.seasonYear);
        keys.push({ gmu, years });
    }
    keys.sort((a, b) => a.gmu - b.gmu);
    return keys;
}

// --- Hand-rolled SVG charts -------------------------------------------------
// No chart library in this app -- a handful of data points (<=7 years) per
// DAU doesn't need one, so these are plain SVG built from the data directly.

const CHART_W = 640;
const BAR_CHART_H = 260;
const LINE_CHART_H = 200;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 56 };

function niceMax(value: number): number {
    if (value <= 0) return 10;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return step * magnitude;
}

function PopulationBarChart({ years }: { years: HerdPopulationRow[] }) {
    const plotW = CHART_W - MARGIN.left - MARGIN.right;
    const plotH = BAR_CHART_H - MARGIN.top - MARGIN.bottom;
    const hasQuota = years.some(y => y.tagQuota != null);
    const maxVal = niceMax(Math.max(...years.map(y => Math.max(y.populationEstimate, y.tagQuota ?? 0))) * 1.05);
    const groupW = plotW / years.length;
    const barW = Math.min(36, groupW * (hasQuota ? 0.32 : 0.45));
    const scaleY = (v: number) => plotH - (v / maxVal) * plotH;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));

    return (
        <svg width={CHART_W} height={BAR_CHART_H} role="img" aria-label="Population estimate by year">
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={0} x2={plotW} y1={scaleY(t)} y2={scaleY(t)} stroke="#2a2a2a" strokeWidth={1} />
                        <text x={-8} y={scaleY(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#64748b">
                            {t.toLocaleString()}
                        </text>
                    </g>
                ))}
                {years.map((y, i) => {
                    const cx = i * groupW + groupW / 2;
                    const popX = hasQuota ? cx - barW - 2 : cx - barW / 2;
                    const popH = plotH - scaleY(y.populationEstimate);
                    return (
                        <g key={y.seasonYear}>
                            <rect x={popX} y={scaleY(y.populationEstimate)} width={barW} height={popH} fill="#3b82f6" rx={2}>
                                <title>{`${y.seasonYear} population: ${y.populationEstimate.toLocaleString()}`}</title>
                            </rect>
                            {y.tagQuota != null && (
                                <rect x={cx + 2} y={scaleY(y.tagQuota)} width={barW} height={plotH - scaleY(y.tagQuota)} fill="#f59e0b" rx={2}>
                                    <title>{`${y.seasonYear} primary draw tag quota: ${y.tagQuota.toLocaleString()}`}</title>
                                </rect>
                            )}
                            <text x={cx} y={plotH + 18} textAnchor="middle" fontSize={11} fill="#94a3b8">{y.seasonYear}</text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}

function RatioLineChart({ years, maleTerm }: { years: HerdPopulationRow[]; maleTerm: string }) {
    const plotW = CHART_W - MARGIN.left - MARGIN.right;
    const plotH = LINE_CHART_H - MARGIN.top - MARGIN.bottom;
    const withRatio = years.filter(y => y.sexRatio != null);
    const maxVal = niceMax(Math.max(...withRatio.map(y => y.sexRatio as number), 10) * 1.15);
    const stepX = years.length > 1 ? plotW / (years.length - 1) : 0;
    const scaleX = (i: number) => i * stepX;
    const scaleY = (v: number) => plotH - (v / maxVal) * plotH;

    const points = years
        .map((y, i) => (y.sexRatio != null ? `${scaleX(i)},${scaleY(y.sexRatio)}` : null))
        .filter((p): p is string => p != null)
        .join(" ");

    const ticks = [0, 0.5, 1].map(f => Math.round(maxVal * f));

    return (
        <svg width={CHART_W} height={LINE_CHART_H} role="img" aria-label="Sex ratio by year">
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={0} x2={plotW} y1={scaleY(t)} y2={scaleY(t)} stroke="#2a2a2a" strokeWidth={1} />
                        <text x={-8} y={scaleY(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#64748b">{t}</text>
                    </g>
                ))}
                <polyline points={points} fill="none" stroke="#22c55e" strokeWidth={2} />
                {years.map((y, i) => y.sexRatio != null && (
                    <g key={y.seasonYear}>
                        <circle cx={scaleX(i)} cy={scaleY(y.sexRatio)} r={3.5} fill="#22c55e">
                            <title>{`${y.seasonYear} ${maleTerm}s per 100 females: ${y.sexRatio}`}</title>
                        </circle>
                        <text x={scaleX(i)} y={plotH + 18} textAnchor="middle" fontSize={11} fill="#94a3b8">{y.seasonYear}</text>
                    </g>
                ))}
            </g>
        </svg>
    );
}

// Bear's tag quota and harvest are wildly different magnitudes (quota is
// often a non-binding cap in the thousands -- status "Leftover" for every
// applicant category -- while harvest is a real count in the tens), so
// sharing one y-axis the way Population/TagQuota do above would make
// harvest all but invisible. Two independently-scaled charts instead, same
// "stack two single-series charts" pattern as Population + RatioLine.
function SingleSeriesBarChart({
    years, color, height, valueOf, titleOf, chartLabel,
}: {
    years: BearGmuStatsRow[];
    color: string;
    height: number;
    valueOf: (y: BearGmuStatsRow) => number | null;
    titleOf: (y: BearGmuStatsRow) => string;
    chartLabel: string;
}) {
    const plotW = CHART_W - MARGIN.left - MARGIN.right;
    const plotH = height - MARGIN.top - MARGIN.bottom;
    const maxVal = niceMax(Math.max(...years.map(y => valueOf(y) ?? 0), 1) * 1.05);
    const groupW = plotW / years.length;
    const barW = Math.min(36, groupW * 0.5);
    const scaleY = (v: number) => plotH - (v / maxVal) * plotH;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));

    return (
        <svg width={CHART_W} height={height} role="img" aria-label={chartLabel}>
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={0} x2={plotW} y1={scaleY(t)} y2={scaleY(t)} stroke="#2a2a2a" strokeWidth={1} />
                        <text x={-8} y={scaleY(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#64748b">
                            {t.toLocaleString()}
                        </text>
                    </g>
                ))}
                {years.map((y, i) => {
                    const v = valueOf(y);
                    const cx = i * groupW + groupW / 2;
                    return (
                        <g key={y.seasonYear}>
                            {v != null && (
                                <rect x={cx - barW / 2} y={scaleY(v)} width={barW} height={plotH - scaleY(v)} fill={color} rx={2}>
                                    <title>{titleOf(y)}</title>
                                </rect>
                            )}
                            <text x={cx} y={plotH + 18} textAnchor="middle" fontSize={11} fill="#94a3b8">{y.seasonYear}</text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}

function pickDefaultGmu(rows: BearGmuStatsRow[]): number | null {
    const home = rows.find(r => r.gmu === 109);
    if (home) return home.gmu;
    const sorted = [...rows].sort((a, b) => a.gmu - b.gmu);
    return sorted[0]?.gmu ?? null;
}

function pickDefaultDau(rows: HerdPopulationRow[], species: HerdSpecies): string | null {
    const speciesRows = rows.filter(r => r.species === species);
    // Default to the DAU covering GMU 109 if present (the area this app's
    // other tabs already center on), else the first DAU for that species.
    const home = speciesRows.find(r => r.gmus.split(",").map(g => g.trim()).includes("109"));
    if (home) return home.dau;
    const sorted = [...speciesRows].sort((a, b) => parseDauNum(a.dau) - parseDauNum(b.dau));
    return sorted[0]?.dau ?? null;
}

export function HerdTab() {
    const [rows, setRows] = useState<HerdPopulationRow[] | null>(null);
    const [bearRows, setBearRows] = useState<BearGmuStatsRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [species, setSpecies] = useState<HerdSpecies>("deer");
    const [selectedDau, setSelectedDau] = useState<string | null>(null);
    const [selectedGmu, setSelectedGmu] = useState<number | null>(null);

    useEffect(() => {
        Promise.all([fetchHerdPopulation(), fetchBearGmuStats()])
            .then(([data, bearData]) => {
                setRows(data);
                setBearRows(bearData);
                const available = SPECIES_ORDER.filter(s =>
                    s === "bear" ? bearData.length > 0 : data.some(r => r.species === s)
                );
                const firstSpecies = available[0] ?? "deer";
                setSpecies(firstSpecies);
                if (firstSpecies === "bear") setSelectedGmu(pickDefaultGmu(bearData));
                else setSelectedDau(pickDefaultDau(data, firstSpecies));
            })
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load"));
    }, []);

    const availableSpecies = useMemo(
        () => (rows && bearRows
            ? SPECIES_ORDER.filter(s => (s === "bear" ? bearRows.length > 0 : rows.some(r => r.species === s)))
            : []),
        [rows, bearRows]
    );

    const dauKeys = useMemo(() => (rows && species !== "bear" ? buildDauKeys(rows, species) : []), [rows, species]);
    const gmuKeys = useMemo(() => (bearRows && species === "bear" ? buildGmuKeys(bearRows) : []), [bearRows, species]);

    const visibleKeys = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return dauKeys;
        return dauKeys.filter(k =>
            k.dau.includes(q) ||
            (k.herdName ?? "").toLowerCase().includes(q) ||
            k.gmus.toLowerCase().includes(q)
        );
    }, [dauKeys, search]);

    const visibleGmuKeys = useMemo(() => {
        const q = search.trim();
        if (!q) return gmuKeys;
        return gmuKeys.filter(k => String(k.gmu).includes(q));
    }, [gmuKeys, search]);

    const selected = dauKeys.find(k => k.dau === selectedDau) ?? null;
    const selectedGmuKey = gmuKeys.find(k => k.gmu === selectedGmu) ?? null;
    const meta = SPECIES_META[species];

    const handleSpeciesChange = (next: HerdSpecies) => {
        setSpecies(next);
        setSearch("");
        if (next === "bear") { if (bearRows) setSelectedGmu(pickDefaultGmu(bearRows)); }
        else if (rows) setSelectedDau(pickDefaultDau(rows, next));
    };

    if (error) return <div style={{ padding: 24, color: "#ef4444" }}>{error}</div>;
    if (rows == null || bearRows == null) return <div style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;

    return (
        <div style={{ padding: "0", maxWidth: 1100 }}>
            <div style={{ padding: "20px 24px 0" }}>
                <h3 style={{ color: "#e2e8f0", margin: "0 0 4px" }}>
                    Herd -- {species === "bear" ? "Tags vs Harvest by GMU" : "Population & Sex Ratio by DAU"}
                </h3>
                {species === "bear" ? (
                    <div style={{ color: "#64748b", fontSize: 12 }}>
                        Bear isn't managed as a herd with a DAU population survey the way Deer/Elk/Pronghorn are, so
                        there's no population estimate here -- instead, each GMU's primary draw tag quota vs its
                        reported harvest. <strong>Tags and harvest aren't always the same resolution:</strong> tags
                        are tracked by the hunt code's own unit number, but several bear hunt codes bundle multiple
                        physical GMUs under one code (e.g. GMUs 5 and 6 have no hunt code of their own -- they're
                        hunted under GMU 4's code), while harvest is reported per actual GMU. A GMU showing harvest
                        with no tags bar usually means it's hunted under a different GMU's code, not that tags data
                        is missing. Tags also only cover the <em>primary draw</em> -- not secondary or leftover/OTC.
                    </div>
                ) : (
                    <div style={{ color: "#64748b", fontSize: 12 }}>
                        CPW's annual post-hunt population estimates by Data Analysis Unit (DAU -- a group of GMUs managed
                        as one herd). DAU numbers are per-species (Deer DAU 01 and Elk DAU 01 are unrelated herds) and
                        not always stable across years within a species -- Deer in particular had several DAUs
                        restructured in 2024, so a few DAU numbers only have data for part of the range covered. Tag
                        quota is the DAU's GMUs' summed <em>primary draw</em> quota, where that data exists -- it
                        doesn't include secondary draw or leftover/OTC tags, so it understates total tags for units
                        with meaningful volume there.
                    </div>
                )}
            </div>
            {availableSpecies.length > 1 && (
                <div style={{ display: "flex", gap: 4, padding: "10px 24px 0" }}>
                    {availableSpecies.map(s => (
                        <button key={s} style={speciesTabStyle(s === species)} onClick={() => handleSpeciesChange(s)}>
                            {SPECIES_META[s].label}
                        </button>
                    ))}
                </div>
            )}
            <div style={panelStyle}>
                {species === "bear" ? (
                    <>
                        <div style={keyColStyle}>
                            <div style={{ padding: 12, borderBottom: "1px solid #2a2a2a" }}>
                                <input
                                    style={inputStyle}
                                    placeholder="Search GMU…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                            <div style={dauListStyle}>
                                {visibleGmuKeys.map(k => (
                                    <div
                                        key={k.gmu}
                                        style={dauRowStyle(k.gmu === selectedGmu)}
                                        onClick={() => setSelectedGmu(k.gmu)}
                                    >
                                        <div style={dauTitleStyle}>GMU {k.gmu}</div>
                                        <div style={dauSubStyle}>{k.years.length} year{k.years.length === 1 ? "" : "s"} of data</div>
                                    </div>
                                ))}
                                {visibleGmuKeys.length === 0 && (
                                    <div style={{ padding: 14, color: "#64748b", fontSize: 12 }}>No GMUs match.</div>
                                )}
                            </div>
                        </div>
                        <div style={chartColStyle}>
                            {!selectedGmuKey && <div style={{ color: "#64748b" }}>Select a GMU to see its chart.</div>}
                            {selectedGmuKey && (
                                <>
                                    <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                                        Bear GMU {selectedGmuKey.gmu}
                                    </div>
                                    <div style={{ color: "#64748b", fontSize: 12, marginBottom: 16 }}>
                                        {selectedGmuKey.years.length} year{selectedGmuKey.years.length === 1 ? "" : "s"} of data
                                    </div>

                                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                                        Primary Draw Tag Quota
                                    </div>
                                    <SingleSeriesBarChart
                                        years={selectedGmuKey.years}
                                        color="#f59e0b"
                                        height={BAR_CHART_H}
                                        valueOf={y => y.tagQuota}
                                        titleOf={y => `${y.seasonYear} primary draw tag quota: ${(y.tagQuota ?? 0).toLocaleString()}`}
                                        chartLabel="Primary draw tag quota by year"
                                    />

                                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, margin: "18px 0 6px" }}>
                                        Harvest
                                    </div>
                                    <SingleSeriesBarChart
                                        years={selectedGmuKey.years}
                                        color="#3b82f6"
                                        height={LINE_CHART_H}
                                        valueOf={y => y.harvest}
                                        titleOf={y => `${y.seasonYear} harvest: ${(y.harvest ?? 0).toLocaleString()}`}
                                        chartLabel="Harvest by year"
                                    />
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div style={keyColStyle}>
                            <div style={{ padding: 12, borderBottom: "1px solid #2a2a2a" }}>
                                <input
                                    style={inputStyle}
                                    placeholder="Search DAU, herd, GMU…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                            <div style={dauListStyle}>
                                {visibleKeys.map(k => (
                                    <div
                                        key={k.dau}
                                        style={dauRowStyle(k.dau === selectedDau)}
                                        onClick={() => setSelectedDau(k.dau)}
                                    >
                                        <div style={dauTitleStyle}>DAU {k.dau}{k.herdName ? ` -- ${k.herdName}` : ""}</div>
                                        <div style={dauSubStyle}>GMUs: {k.gmus}</div>
                                    </div>
                                ))}
                                {visibleKeys.length === 0 && (
                                    <div style={{ padding: 14, color: "#64748b", fontSize: 12 }}>No DAUs match.</div>
                                )}
                            </div>
                        </div>
                        <div style={chartColStyle}>
                            {!selected && <div style={{ color: "#64748b" }}>Select a DAU to see its charts.</div>}
                            {selected && (
                                <>
                                    <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                                        {meta.label} DAU {selected.dau}{selected.herdName ? ` -- ${selected.herdName}` : ""}
                                    </div>
                                    <div style={{ color: "#64748b", fontSize: 12, marginBottom: 16 }}>
                                        GMUs: {selected.gmus} &middot; {selected.years.length} year{selected.years.length === 1 ? "" : "s"} of data
                                    </div>

                                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                                        Post-Hunt Population Estimate
                                        {selected.years.some(y => y.tagQuota != null) && (
                                            <span style={{ fontWeight: 400 }}>
                                                {" "}(<span style={{ color: "#3b82f6" }}>■</span> population &nbsp;
                                                <span style={{ color: "#f59e0b" }}>■</span> primary draw tag quota)
                                            </span>
                                        )}
                                    </div>
                                    <PopulationBarChart years={selected.years} />

                                    <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, margin: "18px 0 6px" }}>
                                        {meta.sexRatioLabel}
                                    </div>
                                    <RatioLineChart years={selected.years} maleTerm={meta.maleTerm} />
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
