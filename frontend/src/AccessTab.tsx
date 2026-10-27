import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAccessAreas, fetchAccessAreaSpeciesList, saveAccessArea, type AccessArea } from "./services/accessAreaApi";

type SortMode = "gmu" | "distance" | "species";
type TypeFilter = "all" | "SWA" | "STL";
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
// Notes can run long (multi-sentence scouting writeups) -- a textarea that
// wraps beats a single-line input you have to arrow across. Starts at 2
// lines so the common case (short note or none) doesn't bloat every row,
// but is user-resizable (vertical only, so it can't blow out the table's
// width) for the rows that need more room.
const notesTextareaStyle: React.CSSProperties = {
    ...inputStyle, width: "100%", boxSizing: "border-box",
    minHeight: 36, resize: "vertical", lineHeight: 1.4, fontFamily: "inherit",
};
const tableWrapStyle: React.CSSProperties = { overflowX: "auto", border: "1px solid #2a2a2a", borderRadius: 6 };
// table-layout:fixed so these widths are actually honored instead of being
// just a hint the browser's auto layout can override based on content.
// Facilities and Camping were cut to 50%/75% of their original width on
// request; the freed space (70px + 52px) went entirely to Notes.
const COLUMN_WIDTHS = {
    name: 180, type: 60, county: 110, gmu: 80, distance: 80, acres: 80,
    species: 220, recreation: 160, facilities: 70, camping: 18, notes: 382,
};
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" };
const campingTdStyle: React.CSSProperties = { padding: "6px 2px", color: "#e2e8f0", verticalAlign: "top", textAlign: "center" };
const thStyle: React.CSSProperties = {
    position: "sticky", top: 0, background: "#1a1a1a", textAlign: "left", padding: "8px 10px",
    color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "6px 10px", color: "#e2e8f0", verticalAlign: "top" };
const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const badgeStyle = (type: "SWA" | "STL"): React.CSSProperties => ({
    display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700,
    background: type === "SWA" ? "#1e3a5f" : "#3a2a1e", color: type === "SWA" ? "#7dd3fc" : "#fbbf24",
});

function firstSortableSpecies(species: string[]): string {
    if (species.length === 0) return "￿"; // sort empty-species rows last
    return [...species].sort()[0];
}

export function AccessTab() {
    const [areas, setAreas] = useState<AccessArea[] | null>(null);
    const [speciesList, setSpeciesList] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<Record<number, SaveStatus>>({});
    const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [speciesFilter, setSpeciesFilter] = useState<string>("all");
    const [sortMode, setSortMode] = useState<SortMode>("gmu");

    useEffect(() => {
        Promise.all([fetchAccessAreas(), fetchAccessAreaSpeciesList()])
            .then(([a, s]) => { setAreas(a); setSpeciesList(s); })
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load"));
    }, []);

    // Notes and campingAllowed are the only editable fields here (everything
    // else on a row is brochure-sourced). Debounced per-row autosave, same
    // pattern as the rest of the app -- but the checkbox saves immediately
    // (no debounce) since a click is already a discrete, deliberate edit.
    const updateField = useCallback(<K extends "notes" | "campingAllowed">(id: number, field: K, value: AccessArea[K], immediate = false) => {
        setAreas(prev => prev ? prev.map(a => a.id === id ? { ...a, [field]: value } : a) : prev);
        setStatus(s => ({ ...s, [id]: "saving" }));
        const save = () => {
            saveAccessArea(id, { [field]: value })
                .then(() => setStatus(s => ({ ...s, [id]: "saved" })))
                .catch(() => setStatus(s => ({ ...s, [id]: "error" })));
        };
        if (debounceTimers.current[id]) clearTimeout(debounceTimers.current[id]);
        if (immediate) save();
        else debounceTimers.current[id] = setTimeout(save, 600);
    }, []);

    const visibleAreas = useMemo(() => {
        if (!areas) return [];
        const q = search.trim().toLowerCase();
        let rows = areas.filter(a => {
            if (typeFilter !== "all" && a.areaType !== typeFilter) return false;
            if (speciesFilter !== "all" && !a.species.includes(speciesFilter)) return false;
            if (q && !a.name.toLowerCase().includes(q) && !a.county.toLowerCase().includes(q)) return false;
            return true;
        });
        rows = [...rows].sort((a, b) => {
            if (sortMode === "gmu") return (a.primaryGmu ?? 9999) - (b.primaryGmu ?? 9999) || a.name.localeCompare(b.name);
            if (sortMode === "distance") return (a.distanceFromDenverMiles ?? 9999) - (b.distanceFromDenverMiles ?? 9999) || a.name.localeCompare(b.name);
            return firstSortableSpecies(a.species).localeCompare(firstSortableSpecies(b.species)) || a.name.localeCompare(b.name);
        });
        return rows;
    }, [areas, search, typeFilter, speciesFilter, sortMode]);

    if (error) return <div style={{ padding: 24, color: "#ef4444" }}>{error}</div>;
    if (areas == null) return <div style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;

    return (
        <div style={panelStyle}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <h3 style={{ color: "#e2e8f0", margin: 0 }}>Access -- State Wildlife Areas & State Trust Lands</h3>
                <span style={{ color: "#64748b", fontSize: 12 }}>{visibleAreas.length} of {areas.length} properties</span>
            </div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 14 }}>
                Public hunting-access properties, transcribed from the CPW State Recreation Lands brochure. Sort or filter to find areas that support a given species. Camping and Notes are yours to edit as you research -- Camping starts from the brochure's text but may not matter for a day-access spot, or may need correcting.
            </div>

            <div style={controlsRowStyle}>
                <input
                    style={{ ...inputStyle, width: 200 }}
                    placeholder="Search name or county…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <span style={labelStyle}>Type</span>
                <select style={inputStyle} value={typeFilter} onChange={e => setTypeFilter(e.target.value as TypeFilter)}>
                    <option value="all">All</option>
                    <option value="SWA">SWA</option>
                    <option value="STL">STL</option>
                </select>
                <span style={labelStyle}>Species</span>
                <select style={inputStyle} value={speciesFilter} onChange={e => setSpeciesFilter(e.target.value)}>
                    <option value="all">All species</option>
                    {speciesList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span style={labelStyle}>Sort by</span>
                <select style={inputStyle} value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}>
                    <option value="gmu">GMU</option>
                    <option value="distance">Distance from Denver</option>
                    <option value="species">Species</option>
                </select>
            </div>

            <div style={tableWrapStyle}>
                <table style={tableStyle}>
                    <colgroup>
                        <col style={{ width: COLUMN_WIDTHS.name }} />
                        <col style={{ width: COLUMN_WIDTHS.type }} />
                        <col style={{ width: COLUMN_WIDTHS.county }} />
                        <col style={{ width: COLUMN_WIDTHS.gmu }} />
                        <col style={{ width: COLUMN_WIDTHS.distance }} />
                        <col style={{ width: COLUMN_WIDTHS.acres }} />
                        <col style={{ width: COLUMN_WIDTHS.species }} />
                        <col style={{ width: COLUMN_WIDTHS.recreation }} />
                        <col style={{ width: COLUMN_WIDTHS.facilities }} />
                        <col style={{ width: COLUMN_WIDTHS.camping }} />
                        <col style={{ width: COLUMN_WIDTHS.notes }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th style={thStyle}>Name</th>
                            <th style={thStyle}>Type</th>
                            <th style={thStyle}>County</th>
                            <th style={thStyle}>GMU</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Dist (mi)</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Acres</th>
                            <th style={thStyle}>Species</th>
                            <th style={thStyle}>Recreation</th>
                            <th style={{ ...thStyle, whiteSpace: "normal" }}>Facilities</th>
                            <th style={{ ...thStyle, padding: "8px 2px", textAlign: "center" }} title="Camping">⛺</th>
                            <th style={thStyle}>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleAreas.map(a => {
                            const st = status[a.id] ?? "idle";
                            return (
                                <tr key={a.id} style={{ borderBottom: "1px solid #1f1f1f" }}>
                                    <td style={tdStyle} title={a.restrictions || undefined}>{a.name}</td>
                                    <td style={tdStyle}><span style={badgeStyle(a.areaType)}>{a.areaType}</span></td>
                                    <td style={tdStyle}>{a.county}</td>
                                    <td style={tdStyle}>{a.gmus}</td>
                                    <td style={tdNumStyle}>{a.distanceFromDenverMiles ?? "—"}</td>
                                    <td style={tdNumStyle}>{a.acresTotal != null ? a.acresTotal.toLocaleString() : "—"}</td>
                                    <td style={tdStyle}>{a.species.join(", ") || "—"}</td>
                                    <td style={tdStyle}>{a.recreation || "—"}</td>
                                    <td style={tdStyle}>{a.facilities || "—"}</td>
                                    <td style={campingTdStyle}>
                                        <input
                                            type="checkbox"
                                            checked={a.campingAllowed}
                                            onChange={e => updateField(a.id, "campingAllowed", e.target.checked, true)}
                                        />
                                    </td>
                                    <td style={tdStyle}>
                                        <textarea
                                            rows={2}
                                            style={notesTextareaStyle}
                                            value={a.notes}
                                            placeholder="Restrictions/issues you find…"
                                            onChange={e => updateField(a.id, "notes", e.target.value)}
                                        />
                                        {st !== "idle" && (
                                            <span style={{ fontSize: 10, color: st === "error" ? "#ef4444" : "#64748b" }}>
                                                {st === "saving" ? "Saving…" : st === "saved" ? "Saved" : "Save failed"}
                                            </span>
                                        )}
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
