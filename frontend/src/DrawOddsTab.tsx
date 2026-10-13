import { useEffect, useMemo, useState } from "react";
import { fetchDrawOdds, type DrawOddsRow } from "./services/drawOddsApi";

type SortMode = "gmu" | "success" | "recdays" | "primaryPoints" | "secondaryPoints";
type SpeciesFilter = "all" | "deer" | "elk" | "pronghorn";
type MethodFilter = "all" | "A" | "M" | "R" | "X";
type SexFilter = "all" | "M" | "F" | "E";

const SPECIES_LABEL: Record<string, string> = { deer: "Deer", elk: "Elk", pronghorn: "Pronghorn" };
const METHOD_LABEL: Record<string, string> = { A: "Archery", M: "Muzzleloader", R: "Rifle", X: "Season Choice", P: "Pref Pt Only" };
const SEX_LABEL: Record<string, string> = { M: "Male", F: "Female", E: "Either" };

const panelStyle: React.CSSProperties = {
    background: "#141414", border: "1px solid #2a2a2a", borderRadius: 8,
    padding: "16px 20px", margin: "20px 24px",
};
const controlsRowStyle: React.CSSProperties = {
    display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14,
};
const inputStyle: React.CSSProperties = {
    background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 4, color: "#e2e8f0",
    padding: "6px 8px", fontSize: 13, fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = { color: "#64748b", fontSize: 12, marginRight: 4 };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto", border: "1px solid #2a2a2a", borderRadius: 6 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thStyle: React.CSSProperties = {
    position: "sticky", top: 0, background: "#1a1a1a", textAlign: "left", padding: "8px 10px",
    color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "6px 10px", color: "#e2e8f0", verticalAlign: "top", whiteSpace: "nowrap" };
const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const groupHeaderStyle: React.CSSProperties = {
    ...thStyle, textAlign: "center", borderLeft: "1px solid #2a2a2a", background: "#1f1f1f",
};

function pointsColor(points: number | null): string {
    if (points == null) return "#e2e8f0";
    if (points === 0) return "#4ade80";
    if (points <= 3) return "#a3e635";
    if (points <= 8) return "#facc15";
    return "#f87171";
}

function statusCell(status: string | null, points: number | null) {
    if (!status) return <span style={{ color: "#3a3a3a" }}>—</span>;
    return <span style={{ color: pointsColor(points), fontWeight: points != null ? 600 : 400 }}>{status}</span>;
}

export function DrawOddsTab() {
    const [rows, setRows] = useState<DrawOddsRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [speciesFilter, setSpeciesFilter] = useState<SpeciesFilter>("all");
    const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
    const [sexFilter, setSexFilter] = useState<SexFilter>("all");
    const [gmuFilter, setGmuFilter] = useState("");
    const [sortMode, setSortMode] = useState<SortMode>("gmu");

    useEffect(() => {
        fetchDrawOdds().then(setRows).catch(err => setError(err instanceof Error ? err.message : "Failed to load"));
    }, []);

    const visibleRows = useMemo(() => {
        if (!rows) return [];
        const q = search.trim().toUpperCase();
        const gmuQ = gmuFilter.trim() ? parseInt(gmuFilter.trim(), 10) : null;
        let out = rows.filter(r => {
            if (speciesFilter !== "all" && r.species !== speciesFilter) return false;
            if (methodFilter !== "all" && r.method !== methodFilter) return false;
            if (sexFilter !== "all" && r.sex !== sexFilter) return false;
            if (gmuQ != null && r.gmu !== gmuQ) return false;
            if (q && !r.huntCode.includes(q)) return false;
            return true;
        });
        out = [...out].sort((a, b) => {
            if (sortMode === "gmu") return (a.gmu ?? 9999) - (b.gmu ?? 9999) || a.huntCode.localeCompare(b.huntCode);
            if (sortMode === "success") return (b.percentSuccess ?? -1) - (a.percentSuccess ?? -1);
            if (sortMode === "recdays") return (a.totalRecDays ?? 9e9) - (b.totalRecDays ?? 9e9);
            if (sortMode === "primaryPoints") return (a.primaryAdultResPoints ?? 9999) - (b.primaryAdultResPoints ?? 9999);
            return (a.secondaryAdultResPoints ?? 9999) - (b.secondaryAdultResPoints ?? 9999);
        });
        return out;
    }, [rows, search, speciesFilter, methodFilter, sexFilter, gmuFilter, sortMode]);

    if (error) return <div style={{ padding: 24, color: "#ef4444" }}>{error}</div>;
    if (rows == null) return <div style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;

    return (
        <div style={panelStyle}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <h3 style={{ color: "#e2e8f0", margin: 0 }}>Draw Odds -- Harvest Stats & Preference Points by Hunt Code</h3>
                <span style={{ color: "#64748b", fontSize: 12 }}>{visibleRows.length} of {rows.length} hunt codes</span>
            </div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 14 }}>
                Start with a GMU to see harvest success % and pressure (rec. days), or filter by Method to find every hunt code of a given type (e.g. archery) across all GMUs. Primary/Secondary columns show the preference points (or Choice/Leftover/No Apps/None Drawn status) it took to draw last time -- hover a cell for Youth and Landowner detail.
            </div>

            <div style={controlsRowStyle}>
                <input
                    style={{ ...inputStyle, width: 140 }}
                    placeholder="Hunt code…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <span style={labelStyle}>Species</span>
                <select style={inputStyle} value={speciesFilter} onChange={e => setSpeciesFilter(e.target.value as SpeciesFilter)}>
                    <option value="all">All</option>
                    <option value="deer">Deer</option>
                    <option value="elk">Elk</option>
                    <option value="pronghorn">Pronghorn</option>
                </select>
                <span style={labelStyle}>Method</span>
                <select style={inputStyle} value={methodFilter} onChange={e => setMethodFilter(e.target.value as MethodFilter)}>
                    <option value="all">All</option>
                    <option value="A">Archery</option>
                    <option value="M">Muzzleloader</option>
                    <option value="R">Rifle</option>
                    <option value="X">Season Choice</option>
                </select>
                <span style={labelStyle}>Sex</span>
                <select style={inputStyle} value={sexFilter} onChange={e => setSexFilter(e.target.value as SexFilter)}>
                    <option value="all">All</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="E">Either</option>
                </select>
                <span style={labelStyle}>GMU</span>
                <input style={{ ...inputStyle, width: 60 }} placeholder="e.g. 3" value={gmuFilter} onChange={e => setGmuFilter(e.target.value)} />
                <span style={labelStyle}>Sort by</span>
                <select style={inputStyle} value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}>
                    <option value="gmu">GMU</option>
                    <option value="success">Success %</option>
                    <option value="recdays">Rec. Days (pressure)</option>
                    <option value="primaryPoints">Primary Pts (Adult Res)</option>
                    <option value="secondaryPoints">Secondary Pts (Adult Res)</option>
                </select>
            </div>

            <div style={tableWrapStyle}>
                <table style={tableStyle}>
                    <thead>
                        <tr>
                            <th style={thStyle} rowSpan={2}>Hunt Code</th>
                            <th style={thStyle} rowSpan={2}>Species</th>
                            <th style={{ ...thStyle, textAlign: "right" }} rowSpan={2}>GMU</th>
                            <th style={thStyle} rowSpan={2}>Method</th>
                            <th style={thStyle} rowSpan={2}>Sex</th>
                            <th style={groupHeaderStyle} colSpan={5}>Harvest ({rows.find(r => r.harvestYear)?.harvestYear ?? "--"})</th>
                            <th style={groupHeaderStyle} colSpan={2}>Primary Draw</th>
                            <th style={groupHeaderStyle} colSpan={2}>Secondary Draw</th>
                        </tr>
                        <tr>
                            <th style={{ ...thStyle, textAlign: "right", borderLeft: "1px solid #2a2a2a" }}>Antlered</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Antlerless</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Hunters</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Success %</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Rec. Days</th>
                            <th style={{ ...thStyle, borderLeft: "1px solid #2a2a2a" }}>Adult Res</th>
                            <th style={thStyle}>Adult NonRes</th>
                            <th style={{ ...thStyle, borderLeft: "1px solid #2a2a2a" }}>Adult Res</th>
                            <th style={thStyle}>Adult NonRes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.map(r => (
                            <tr key={`${r.species}:${r.huntCode}`} style={{ borderBottom: "1px solid #1f1f1f" }}>
                                <td style={tdStyle} title={r.fewResponses ? "Few hunters responded to the harvest survey for this hunt code" : undefined}>
                                    {r.huntCode}{r.fewResponses && <span style={{ color: "#64748b" }}>*</span>}
                                </td>
                                <td style={tdStyle}>{SPECIES_LABEL[r.species] ?? r.species}</td>
                                <td style={tdNumStyle}>{r.gmu ?? "—"}</td>
                                <td style={tdStyle}>{r.method ? (METHOD_LABEL[r.method] ?? r.method) : "—"}</td>
                                <td style={tdStyle}>{r.sex ? (SEX_LABEL[r.sex] ?? r.sex) : "—"}</td>
                                <td style={{ ...tdNumStyle, borderLeft: "1px solid #1f1f1f" }}>{r.antleredCount ?? "—"}</td>
                                <td style={tdNumStyle}>{r.antlerlessCount ?? "—"}</td>
                                <td style={tdNumStyle}>{r.totalHunters ?? "—"}</td>
                                <td style={tdNumStyle}>{r.percentSuccess != null ? `${r.percentSuccess.toFixed(1)}%` : "—"}</td>
                                <td style={tdNumStyle}>{r.totalRecDays ?? "—"}</td>
                                <td
                                    style={{ ...tdStyle, borderLeft: "1px solid #1f1f1f" }}
                                    title={r.primaryYear ? `Youth Res: ${r.primaryYouthResStatus ?? "—"} | Youth NonRes: ${r.primaryYouthNonResStatus ?? "—"} | Landowner Unrestricted: ${r.primaryLandownerUnrestrictedStatus ?? "—"} | Landowner Restricted: ${r.primaryLandownerRestrictedStatus ?? "—"}` : undefined}
                                >
                                    {statusCell(r.primaryAdultResStatus, r.primaryAdultResPoints)}
                                </td>
                                <td style={tdStyle}>{statusCell(r.primaryAdultNonResStatus, r.primaryAdultNonResPoints)}</td>
                                <td
                                    style={{ ...tdStyle, borderLeft: "1px solid #1f1f1f" }}
                                    title={r.secondaryYear ? `Youth Res: ${r.secondaryYouthResStatus ?? "—"} | Youth NonRes: ${r.secondaryYouthNonResStatus ?? "—"} | Landowner Unrestricted: ${r.secondaryLandownerUnrestrictedStatus ?? "—"} | Landowner Restricted: ${r.secondaryLandownerRestrictedStatus ?? "—"}` : undefined}
                                >
                                    {statusCell(r.secondaryAdultResStatus, r.secondaryAdultResPoints)}
                                </td>
                                <td style={tdStyle}>{statusCell(r.secondaryAdultNonResStatus, r.secondaryAdultNonResPoints)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
