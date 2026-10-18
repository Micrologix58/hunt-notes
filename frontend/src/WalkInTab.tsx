import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWalkInAreas, saveWalkInArea, type WalkInArea } from "./services/walkInAreaApi";

type SortMode = "gmu" | "county";
type GameFilter = "all" | "big" | "small";
type SaveStatus = "idle" | "saving" | "saved" | "error";

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
const COLUMN_WIDTHS = {
    label: 220, county: 100, gmu: 60, game: 70, landType: 80, count: 50, locator: 280,
    page: 50, owner: 160, notes: 230, scouted: 70,
};
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" };
const scoutedTdStyle: React.CSSProperties = { padding: "6px 2px", color: "#e2e8f0", verticalAlign: "top", textAlign: "center" };
const thStyle: React.CSSProperties = {
    position: "sticky", top: 0, background: "#1a1a1a", textAlign: "left", padding: "8px 10px",
    color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "6px 10px", color: "#e2e8f0", verticalAlign: "top" };
const gameBadgeStyle = (bigGame: boolean): React.CSSProperties => ({
    display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700,
    background: bigGame ? "#4a3f0a" : "#1e2a3a", color: bigGame ? "#fde047" : "#7dd3fc",
});

export function WalkInTab() {
    const [areas, setAreas] = useState<WalkInArea[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<Record<number, SaveStatus>>({});
    const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

    const [search, setSearch] = useState("");
    const [gmuFilter, setGmuFilter] = useState("");
    const [countyFilter, setCountyFilter] = useState("all");
    const [gameFilter, setGameFilter] = useState<GameFilter>("all");
    const [sortMode, setSortMode] = useState<SortMode>("gmu");

    useEffect(() => {
        fetchWalkInAreas()
            .then(setAreas)
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load"));
    }, []);

    // Owner, Notes and Scouted are the only editable fields here (everything
    // else on a row is read off the atlas map). Debounced per-row autosave,
    // same pattern as Access -- but the checkbox saves immediately (no
    // debounce) since a click is already a discrete, deliberate edit.
    const updateField = useCallback(<K extends "owner" | "notes" | "scouted">(id: number, field: K, value: WalkInArea[K], immediate = false) => {
        setAreas(prev => prev ? prev.map(a => a.id === id ? { ...a, [field]: value } : a) : prev);
        setStatus(s => ({ ...s, [id]: "saving" }));
        const save = () => {
            saveWalkInArea(id, { [field]: value })
                .then(() => setStatus(s => ({ ...s, [id]: "saved" })))
                .catch(() => setStatus(s => ({ ...s, [id]: "error" })));
        };
        if (debounceTimers.current[id]) clearTimeout(debounceTimers.current[id]);
        if (immediate) save();
        else debounceTimers.current[id] = setTimeout(save, 600);
    }, []);

    const counties = useMemo(() => {
        if (!areas) return [];
        return [...new Set(areas.map(a => a.county))].sort();
    }, [areas]);

    const visibleAreas = useMemo(() => {
        if (!areas) return [];
        const q = search.trim().toLowerCase();
        const gmuQ = gmuFilter.trim();
        let rows = areas.filter(a => {
            if (gameFilter === "big" && !a.bigGame) return false;
            if (gameFilter === "small" && a.bigGame) return false;
            if (countyFilter !== "all" && a.county !== countyFilter) return false;
            if (gmuQ && String(a.gmu) !== gmuQ) return false;
            if (q && !a.label.toLowerCase().includes(q) && !a.county.toLowerCase().includes(q) && !a.locator.toLowerCase().includes(q)) return false;
            return true;
        });
        rows = [...rows].sort((a, b) => {
            const gmuDiff = (a.gmu ?? 9999) - (b.gmu ?? 9999);
            if (sortMode === "county") return a.county.localeCompare(b.county) || gmuDiff || a.label.localeCompare(b.label);
            return gmuDiff || a.county.localeCompare(b.county) || a.label.localeCompare(b.label);
        });
        return rows;
    }, [areas, search, gmuFilter, countyFilter, gameFilter, sortMode]);

    if (error) return <div style={{ padding: 24, color: "#ef4444" }}>{error}</div>;
    if (areas == null) return <div style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;

    return (
        <div style={panelStyle}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <h3 style={{ color: "#e2e8f0", margin: 0 }}>Walk-In Atlas -- free access on enrolled private land</h3>
                <span style={{ color: "#64748b", fontSize: 12 }}>{visibleAreas.length} of {areas.length} parcels</span>
            </div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 14 }}>
                Parcels transcribed from CPW's Regular Walk-In Atlas maps, statewide. The atlas has no per-property
                text, just shaded parcels on a map, so Label/Locator are a best-effort read of each parcel's
                position, not a precise address -- use Locator and Source Page to find it in the atlas PDF or on a
                map app. Outside GMU 103/109, a row is a *cluster* of same-type adjoining parcels near one landmark
                (see the # column) rather than one row per shape -- transcribing the whole state shape-by-shape
                wasn't practical by hand. Fill in Owner (e.g. from onX Hunt's landowner layer) and Scouted as you
                research each one.
            </div>

            <div style={controlsRowStyle}>
                <input
                    style={{ ...inputStyle, width: 220 }}
                    placeholder="Search label, county, locator…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <span style={labelStyle}>County</span>
                <select style={inputStyle} value={countyFilter} onChange={e => setCountyFilter(e.target.value)}>
                    <option value="all">All</option>
                    {counties.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span style={labelStyle}>GMU</span>
                <input
                    style={{ ...inputStyle, width: 70 }}
                    placeholder="any"
                    value={gmuFilter}
                    onChange={e => setGmuFilter(e.target.value.replace(/[^0-9]/g, ""))}
                />
                <span style={labelStyle}>Game</span>
                <select style={inputStyle} value={gameFilter} onChange={e => setGameFilter(e.target.value as GameFilter)}>
                    <option value="all">All</option>
                    <option value="big">Big + small game</option>
                    <option value="small">Small game only</option>
                </select>
                <span style={labelStyle}>Sort by</span>
                <select style={inputStyle} value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}>
                    <option value="gmu">GMU</option>
                    <option value="county">County</option>
                </select>
            </div>

            <div style={tableWrapStyle}>
                <table style={tableStyle}>
                    <colgroup>
                        <col style={{ width: COLUMN_WIDTHS.label }} />
                        <col style={{ width: COLUMN_WIDTHS.county }} />
                        <col style={{ width: COLUMN_WIDTHS.gmu }} />
                        <col style={{ width: COLUMN_WIDTHS.game }} />
                        <col style={{ width: COLUMN_WIDTHS.landType }} />
                        <col style={{ width: COLUMN_WIDTHS.count }} />
                        <col style={{ width: COLUMN_WIDTHS.locator }} />
                        <col style={{ width: COLUMN_WIDTHS.page }} />
                        <col style={{ width: COLUMN_WIDTHS.owner }} />
                        <col style={{ width: COLUMN_WIDTHS.notes }} />
                        <col style={{ width: COLUMN_WIDTHS.scouted }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th style={thStyle}>Label</th>
                            <th style={thStyle}>County</th>
                            <th style={thStyle}>GMU</th>
                            <th style={thStyle}>Game</th>
                            <th style={thStyle}>Land Type</th>
                            <th style={{ ...thStyle, textAlign: "right" }} title="Approx. number of adjoining shapes grouped into this row">#</th>
                            <th style={{ ...thStyle, whiteSpace: "normal" }}>Locator</th>
                            <th style={{ ...thStyle, textAlign: "right" }} title="Atlas page">Pg.</th>
                            <th style={thStyle}>Owner</th>
                            <th style={thStyle}>Notes</th>
                            <th style={{ ...thStyle, padding: "8px 2px", textAlign: "center" }} title="Scouted">✓</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleAreas.map(a => {
                            const st = status[a.id] ?? "idle";
                            return (
                                <tr key={a.id} style={{ borderBottom: "1px solid #1f1f1f" }}>
                                    <td style={tdStyle}>{a.label}</td>
                                    <td style={tdStyle}>{a.county}</td>
                                    <td style={tdStyle}>{a.gmu ?? "—"}</td>
                                    <td style={tdStyle}><span style={gameBadgeStyle(a.bigGame)}>{a.bigGame ? "Big+Small" : "Small only"}</span></td>
                                    <td style={tdStyle}>{a.landType || "—"}</td>
                                    <td style={{ ...tdStyle, textAlign: "right" }}>{a.parcelCount}</td>
                                    <td style={tdStyle}>{a.locator || "—"}</td>
                                    <td style={{ ...tdStyle, textAlign: "right" }}>{a.sourcePage ?? "—"}</td>
                                    <td style={tdStyle}>
                                        <input
                                            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                                            value={a.owner}
                                            placeholder="Landowner (e.g. from onX)…"
                                            onChange={e => updateField(a.id, "owner", e.target.value)}
                                        />
                                    </td>
                                    <td style={tdStyle}>
                                        <input
                                            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                                            value={a.notes}
                                            placeholder="Scouting notes…"
                                            onChange={e => updateField(a.id, "notes", e.target.value)}
                                        />
                                        {st !== "idle" && (
                                            <span style={{ fontSize: 10, color: st === "error" ? "#ef4444" : "#64748b" }}>
                                                {st === "saving" ? "Saving…" : st === "saved" ? "Saved" : "Save failed"}
                                            </span>
                                        )}
                                    </td>
                                    <td style={scoutedTdStyle}>
                                        <input
                                            type="checkbox"
                                            checked={a.scouted}
                                            onChange={e => updateField(a.id, "scouted", e.target.checked, true)}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
