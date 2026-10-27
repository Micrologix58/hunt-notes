import { useEffect, useMemo, useState } from "react";
import { fetchHerdPopulation, type HerdPopulationRow } from "./services/herdPopulationApi";

type DauKey = {
    dau: string;
    herdName: string | null;
    gmus: string;
    years: HerdPopulationRow[];
};

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

function parseDauNum(dau: string): number {
    return parseInt(dau, 10);
}

function buildDauKeys(rows: HerdPopulationRow[]): DauKey[] {
    const byDau = new Map<string, HerdPopulationRow[]>();
    for (const r of rows) {
        const arr = byDau.get(r.dau) ?? [];
        arr.push(r);
        byDau.set(r.dau, arr);
    }
    const keys: DauKey[] = [];
    for (const [dau, years] of byDau) {
        years.sort((a, b) => a.seasonYear - b.seasonYear);
        const latest = years[years.length - 1];
        // Herd names are static, just missing from a couple of report
        // editions (2019/2020/2025) -- fall back to the most recent year
        // that *did* print one rather than showing blank for a DAU whose
        // latest year happens to be one of those editions (e.g. DAU 47
        // has a name in 2021-2024 but 2025 omitted the column again).
        const namedYear = [...years].reverse().find(y => y.herdName != null);
        keys.push({ dau, herdName: namedYear?.herdName ?? null, gmus: latest.gmus, years });
    }
    keys.sort((a, b) => parseDauNum(a.dau) - parseDauNum(b.dau));
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

function RatioLineChart({ years }: { years: HerdPopulationRow[] }) {
    const plotW = CHART_W - MARGIN.left - MARGIN.right;
    const plotH = LINE_CHART_H - MARGIN.top - MARGIN.bottom;
    const withRatio = years.filter(y => y.buckDoeRatio != null);
    const maxVal = niceMax(Math.max(...withRatio.map(y => y.buckDoeRatio as number), 10) * 1.15);
    const stepX = years.length > 1 ? plotW / (years.length - 1) : 0;
    const scaleX = (i: number) => i * stepX;
    const scaleY = (v: number) => plotH - (v / maxVal) * plotH;

    const points = years
        .map((y, i) => (y.buckDoeRatio != null ? `${scaleX(i)},${scaleY(y.buckDoeRatio)}` : null))
        .filter((p): p is string => p != null)
        .join(" ");

    const ticks = [0, 0.5, 1].map(f => Math.round(maxVal * f));

    return (
        <svg width={CHART_W} height={LINE_CHART_H} role="img" aria-label="Buck/doe ratio by year">
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={0} x2={plotW} y1={scaleY(t)} y2={scaleY(t)} stroke="#2a2a2a" strokeWidth={1} />
                        <text x={-8} y={scaleY(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#64748b">{t}</text>
                    </g>
                ))}
                <polyline points={points} fill="none" stroke="#22c55e" strokeWidth={2} />
                {years.map((y, i) => y.buckDoeRatio != null && (
                    <g key={y.seasonYear}>
                        <circle cx={scaleX(i)} cy={scaleY(y.buckDoeRatio)} r={3.5} fill="#22c55e">
                            <title>{`${y.seasonYear} buck/doe ratio: ${y.buckDoeRatio} per 100`}</title>
                        </circle>
                        <text x={scaleX(i)} y={plotH + 18} textAnchor="middle" fontSize={11} fill="#94a3b8">{y.seasonYear}</text>
                    </g>
                ))}
            </g>
        </svg>
    );
}

export function HerdTab() {
    const [rows, setRows] = useState<HerdPopulationRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [selectedDau, setSelectedDau] = useState<string | null>(null);

    useEffect(() => {
        fetchHerdPopulation()
            .then(data => {
                setRows(data);
                // Default to the DAU covering GMU 109 if present (the area
                // this app's other tabs already center on), else the first.
                const home = data.find(r => r.gmus.split(",").map(g => g.trim()).includes("109"));
                setSelectedDau(home ? home.dau : data[0]?.dau ?? null);
            })
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load"));
    }, []);

    const dauKeys = useMemo(() => (rows ? buildDauKeys(rows) : []), [rows]);

    const visibleKeys = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return dauKeys;
        return dauKeys.filter(k =>
            k.dau.includes(q) ||
            (k.herdName ?? "").toLowerCase().includes(q) ||
            k.gmus.toLowerCase().includes(q)
        );
    }, [dauKeys, search]);

    const selected = dauKeys.find(k => k.dau === selectedDau) ?? null;

    if (error) return <div style={{ padding: 24, color: "#ef4444" }}>{error}</div>;
    if (rows == null) return <div style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;

    return (
        <div style={{ padding: "0", maxWidth: 1100 }}>
            <div style={{ padding: "20px 24px 0" }}>
                <h3 style={{ color: "#e2e8f0", margin: "0 0 4px" }}>Herd -- Deer Population & Sex Ratio by DAU</h3>
                <div style={{ color: "#64748b", fontSize: 12 }}>
                    CPW's annual post-hunt population estimates, 2019-2025, by Data Analysis Unit (DAU -- a group of
                    GMUs managed as one herd). CPW restructured several DAUs in 2024, so a few DAU numbers only have
                    data for part of this range -- that's real, not a gap in the data. Tag quota (2021-2025 only) is
                    the DAU's GMUs' summed <em>primary draw</em> quota -- it doesn't include secondary draw or
                    leftover/OTC tags, so it understates total tags for units with meaningful volume there.
                </div>
            </div>
            <div style={panelStyle}>
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
                                DAU {selected.dau}{selected.herdName ? ` -- ${selected.herdName}` : ""}
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
                                Buck/Doe Ratio (per 100 does)
                            </div>
                            <RatioLineChart years={selected.years} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
