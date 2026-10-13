import { useEffect, useState } from "react";
import {
    fetchHomeDashboard,
    type HomeDashboard,
    type Species,
    type DrawDateRow,
    type BigGameSeasonRow,
    type SmallGameSeasonRow,
} from "./services/homeApi";

// Canonical row order/labels for the big-game season-dates table. Not every
// species has every row -- e.g. pronghorn only has 'rifle' (one season),
// deer/elk only have 'rifle_1'..'rifle_4' (four numbered seasons), and
// 'plains_rifle' is deer-only. Rows with no data for any column are hidden.
const METHOD_ROWS: { key: string; label: string }[] = [
    { key: "archery", label: "Archery" },
    { key: "muzzleloader", label: "Muzzleloader" },
    { key: "rifle", label: "Rifle" },
    { key: "rifle_1", label: "First Rifle" },
    { key: "rifle_2", label: "Second Rifle" },
    { key: "rifle_3", label: "Third Rifle" },
    { key: "rifle_4", label: "Fourth Rifle" },
    { key: "plains_rifle", label: "Plains Rifle" },
];

const DRAW_EVENT_ROWS: { key: string; label: string }[] = [
    { key: "applications_open", label: "Applications Open" },
    { key: "application_deadline", label: "Application Deadline" },
    { key: "draw_results", label: "Draw Results Posted" },
    { key: "surrender_deadline", label: "Surrender Deadline" },
    { key: "payment_deadline", label: "License Payment Deadline" },
    { key: "licenses_mailed", label: "Licenses in the Mail" },
    { key: "leftover_otc_sale", label: "Leftover/OTC Licenses On Sale" },
];

const panelStyle: React.CSSProperties = {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    padding: "16px 20px",
    marginBottom: 20,
};
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "6px 10px", color: "#94a3b8", fontWeight: 600,
    borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap",
};
const groupRowStyle: React.CSSProperties = {
    color: "#3b82f6", fontWeight: 700, fontSize: 12, textTransform: "uppercase",
    letterSpacing: "0.04em", paddingTop: 14, paddingBottom: 4,
};
const tdLabelStyle: React.CSSProperties = { padding: "4px 10px", color: "#94a3b8", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "4px 10px", color: "#e2e8f0" };

function DrawSection({ drawType, title, rows, speciesCols }: {
    drawType: "primary" | "secondary";
    title: string;
    rows: DrawDateRow[];
    speciesCols: Species[];
}) {
    const byEventKey = new Map(rows.filter(r => r.drawType === drawType).map(r => [r.eventKey, r]));
    const activeRows = DRAW_EVENT_ROWS.filter(r => byEventKey.has(r.key));
    if (activeRows.length === 0) return null;

    return (
        <>
            <tr><td colSpan={speciesCols.length + 1} style={groupRowStyle}>{title}</td></tr>
            {activeRows.map(row => {
                const data = byEventKey.get(row.key)!;
                return (
                    <tr key={row.key} style={{ borderBottom: "1px solid #1f1f1f" }}>
                        <td style={tdLabelStyle}>{row.label}</td>
                        {speciesCols.map(s => (
                            <td key={s.SpeciesKey} style={tdStyle} title={data.notes ?? undefined}>
                                {data.displayText}
                            </td>
                        ))}
                    </tr>
                );
            })}
        </>
    );
}

function BigGameTable({ dashboard }: { dashboard: HomeDashboard }) {
    const speciesCols = dashboard.species
        .filter(s => s.Category === "big_game")
        .sort((a, b) => a.SortOrder - b.SortOrder);

    const bySpeciesAndMethod = new Map<string, BigGameSeasonRow>();
    for (const row of dashboard.bigGameSeasons) {
        bySpeciesAndMethod.set(`${row.speciesKey}:${row.methodKey}`, row);
    }

    const activeMethodRows = METHOD_ROWS.filter(m =>
        speciesCols.some(s => bySpeciesAndMethod.has(`${s.SpeciesKey}:${m.key}`))
    );

    return (
        <div style={panelStyle}>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 4px" }}>Big Game -- {dashboard.seasonYear}</h3>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 10 }}>
                Primary/secondary draw dates apply to the unified deer/elk/pronghorn draw -- same for every column.
            </div>
            <table style={tableStyle}>
                <thead>
                    <tr>
                        <th style={thStyle}></th>
                        {speciesCols.map(s => <th key={s.SpeciesKey} style={thStyle}>{s.DisplayName}</th>)}
                    </tr>
                </thead>
                <tbody>
                    <DrawSection drawType="primary" title="Primary Draw" rows={dashboard.drawDates} speciesCols={speciesCols} />
                    <DrawSection drawType="secondary" title="Secondary Draw" rows={dashboard.drawDates} speciesCols={speciesCols} />

                    <tr><td colSpan={speciesCols.length + 1} style={groupRowStyle}>Season Dates</td></tr>
                    {activeMethodRows.map(method => (
                        <tr key={method.key} style={{ borderBottom: "1px solid #1f1f1f" }}>
                            <td style={tdLabelStyle}>{method.label}</td>
                            {speciesCols.map(s => {
                                const data = bySpeciesAndMethod.get(`${s.SpeciesKey}:${method.key}`);
                                return (
                                    <td key={s.SpeciesKey} style={tdStyle} title={data?.notes ?? undefined}>
                                        {data?.displayText ?? <span style={{ color: "#3a3a3a" }}>--</span>}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SmallGameTable({ dashboard }: { dashboard: HomeDashboard }) {
    const speciesCols = dashboard.species
        .filter(s => s.Category === "small_game")
        .sort((a, b) => a.SortOrder - b.SortOrder);

    const bySpecies = new Map<string, SmallGameSeasonRow[]>();
    for (const row of dashboard.smallGameSeasons) {
        const arr = bySpecies.get(row.speciesKey) ?? [];
        arr.push(row);
        bySpecies.set(row.speciesKey, arr);
    }

    const cell = (rows: SmallGameSeasonRow[], pick: (r: SmallGameSeasonRow) => string, withAreaNote = false) => (
        <>
            {rows.map((r, i) => (
                <div key={i} style={{ marginBottom: rows.length > 1 && i < rows.length - 1 ? 6 : 0 }}>
                    {rows.length > 1 && <div style={{ color: "#64748b", fontSize: 11 }}>{r.seasonLabel}</div>}
                    <div>{pick(r)}</div>
                    {withAreaNote && r.areaNote && (
                        <div style={{ color: "#64748b", fontSize: 11 }}>{r.areaNote}</div>
                    )}
                </div>
            ))}
        </>
    );

    return (
        <div style={panelStyle}>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 4px" }}>Small Game -- {dashboard.seasonYear}</h3>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 10 }}>
                Species with more than one season window (e.g. sage grouse, pheasant) list each one; the area note shows where that season applies.
            </div>
            <table style={tableStyle}>
                <thead>
                    <tr>
                        <th style={thStyle}></th>
                        {speciesCols.map(s => <th key={s.SpeciesKey} style={thStyle}>{s.DisplayName}</th>)}
                    </tr>
                </thead>
                <tbody>
                    <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                        <td style={tdLabelStyle}>Season</td>
                        {speciesCols.map(s => (
                            <td key={s.SpeciesKey} style={tdStyle}>
                                {cell(bySpecies.get(s.SpeciesKey) ?? [], r => r.displayText, true)}
                            </td>
                        ))}
                    </tr>
                    <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                        <td style={tdLabelStyle}>Daily Bag Limit</td>
                        {speciesCols.map(s => (
                            <td key={s.SpeciesKey} style={tdStyle}>
                                {cell(bySpecies.get(s.SpeciesKey) ?? [], r => r.dailyBagLimit)}
                            </td>
                        ))}
                    </tr>
                    <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                        <td style={tdLabelStyle}>Possession Limit</td>
                        {speciesCols.map(s => (
                            <td key={s.SpeciesKey} style={tdStyle}>
                                {cell(bySpecies.get(s.SpeciesKey) ?? [], r => r.possessionLimit)}
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export function HomeTab() {
    const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchHomeDashboard()
            .then(data => { if (!cancelled) setDashboard(data); })
            .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load"); });
        return () => { cancelled = true; };
    }, []);

    return (
        <div style={{ padding: "20px 24px", maxWidth: 1100 }}>
            {error && <div style={{ color: "#ef4444" }}>{error}</div>}
            {!error && dashboard == null && <div style={{ color: "#94a3b8" }}>Loading…</div>}
            {dashboard && (
                <>
                    <BigGameTable dashboard={dashboard} />
                    <SmallGameTable dashboard={dashboard} />
                </>
            )}
        </div>
    );
}
