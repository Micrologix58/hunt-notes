import { useCallback, useEffect, useRef, useState } from "react";
import {
    fetchMyHuntPlans, saveMyHuntPlan, addLeftoverPurchase, saveLeftoverPurchase, deleteLeftoverPurchase,
    type DrawResult, type MyHuntPlan, type LeftoverPurchase,
} from "./services/myHuntApi";

const SPECIES: { key: MyHuntPlan["speciesKey"]; label: string }[] = [
    { key: "deer", label: "Deer" },
    { key: "elk", label: "Elk" },
    { key: "pronghorn", label: "Pronghorn" },
    { key: "bear", label: "Bear" },
];

type SaveStatus = "idle" | "saving" | "saved" | "error";

const panelStyle: React.CSSProperties = {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    padding: "16px 20px",
    marginBottom: 20,
};
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "6px 16px", color: "#94a3b8", fontWeight: 600,
    borderBottom: "1px solid #2a2a2a", whiteSpace: "nowrap", minWidth: 200,
};
const groupRowStyle: React.CSSProperties = {
    color: "#3b82f6", fontWeight: 700, fontSize: 12, textTransform: "uppercase",
    letterSpacing: "0.04em", paddingTop: 14, paddingBottom: 4,
};
const tdLabelStyle: React.CSSProperties = { padding: "6px 14px 6px 10px", color: "#94a3b8", whiteSpace: "nowrap", verticalAlign: "top" };
const tdWrapLabelStyle: React.CSSProperties = { ...tdLabelStyle, whiteSpace: "normal", maxWidth: 160 };
const tdStyle: React.CSSProperties = { padding: "4px 16px", minWidth: 200 };

const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "#0d0d0d", border: "1px solid #2a2a2a",
    borderRadius: 4, color: "#e2e8f0", padding: "5px 7px", fontSize: 13, fontFamily: "inherit",
};
const selectStyle: React.CSSProperties = { ...inputStyle };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 50, resize: "vertical" };
const checkboxWrapStyle: React.CSSProperties = { display: "flex", alignItems: "center", height: 28 };

const leftoverCardStyle: React.CSSProperties = {
    border: "1px solid #2a2a2a", borderRadius: 6, padding: 8, marginBottom: 8,
    display: "flex", flexDirection: "column", gap: 6,
};
const leftoverCardRowStyle: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center" };
const leftoverHuntCodeInputStyle: React.CSSProperties = { ...inputStyle, width: "auto", flex: "1 1 0%", minWidth: 0 };
const removeButtonStyle: React.CSSProperties = {
    background: "transparent", border: "1px solid #2a2a2a", borderRadius: 4, color: "#94a3b8",
    width: 24, height: 24, flexShrink: 0, cursor: "pointer", fontSize: 13, lineHeight: 1,
};
const addButtonStyle: React.CSSProperties = {
    background: "transparent", border: "1px dashed #2a2a2a", borderRadius: 4, color: "#64748b",
    padding: "5px 8px", fontSize: 12, cursor: "pointer", width: "100%",
};

const DRAW_RESULT_OPTIONS: { value: DrawResult; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "drawn", label: "Drawn" },
    { value: "not_drawn", label: "Not Drawn" },
];

function StatusDot({ status }: { status: SaveStatus }) {
    if (status === "idle") return null;
    const text = status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save failed";
    const color = status === "error" ? "#ef4444" : "#64748b";
    return <span style={{ fontSize: 11, color, marginLeft: 8 }}>{text}</span>;
}

export function MyHuntTab() {
    const [year, setYear] = useState(() => new Date().getFullYear() + 1);
    const [plans, setPlans] = useState<Record<string, MyHuntPlan> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<Record<string, SaveStatus>>({});
    const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        let cancelled = false;
        setPlans(null);
        setError(null);
        fetchMyHuntPlans(year)
            .then(data => {
                if (cancelled) return;
                const byKey: Record<string, MyHuntPlan> = {};
                for (const p of data) byKey[p.speciesKey] = p;
                setPlans(byKey);
                setStatus({});
            })
            .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load"); });
        return () => { cancelled = true; };
    }, [year]);

    const scheduleSave = useCallback((speciesKey: string, next: MyHuntPlan) => {
        setStatus(s => ({ ...s, [speciesKey]: "saving" }));
        if (debounceTimers.current[speciesKey]) clearTimeout(debounceTimers.current[speciesKey]);
        debounceTimers.current[speciesKey] = setTimeout(() => {
            saveMyHuntPlan(year, speciesKey, next)
                .then(() => setStatus(s => ({ ...s, [speciesKey]: "saved" })))
                .catch(() => setStatus(s => ({ ...s, [speciesKey]: "error" })));
        }, 500);
    }, [year]);

    const updateField = useCallback(<K extends keyof MyHuntPlan>(speciesKey: string, field: K, value: MyHuntPlan[K]) => {
        setPlans(prev => {
            if (!prev) return prev;
            const next = { ...prev[speciesKey], [field]: value };
            scheduleSave(speciesKey, next);
            return { ...prev, [speciesKey]: next };
        });
    }, [scheduleSave]);

    const handleAddLeftover = useCallback((speciesKey: string) => {
        addLeftoverPurchase(year, speciesKey)
            .then(created => {
                setPlans(prev => {
                    if (!prev) return prev;
                    const next = { ...prev[speciesKey], leftoverPurchases: [...prev[speciesKey].leftoverPurchases, created] };
                    return { ...prev, [speciesKey]: next };
                });
            })
            .catch(() => setStatus(s => ({ ...s, [speciesKey]: "error" })));
    }, [year]);

    const updateLeftoverField = useCallback((speciesKey: string, id: number, field: keyof LeftoverPurchase, value: string) => {
        setPlans(prev => {
            if (!prev) return prev;
            const purchases = prev[speciesKey].leftoverPurchases.map(p => p.id === id ? { ...p, [field]: value } : p);
            const next = { ...prev[speciesKey], leftoverPurchases: purchases };

            const timerKey = `leftover:${id}`;
            setStatus(s => ({ ...s, [speciesKey]: "saving" }));
            if (debounceTimers.current[timerKey]) clearTimeout(debounceTimers.current[timerKey]);
            const updated = purchases.find(p => p.id === id)!;
            debounceTimers.current[timerKey] = setTimeout(() => {
                saveLeftoverPurchase(id, { huntCode: updated.huntCode, purchaseDate: updated.purchaseDate, notes: updated.notes })
                    .then(() => setStatus(s => ({ ...s, [speciesKey]: "saved" })))
                    .catch(() => setStatus(s => ({ ...s, [speciesKey]: "error" })));
            }, 500);

            return { ...prev, [speciesKey]: next };
        });
    }, []);

    const handleRemoveLeftover = useCallback((speciesKey: string, id: number) => {
        setPlans(prev => {
            if (!prev) return prev;
            const next = { ...prev[speciesKey], leftoverPurchases: prev[speciesKey].leftoverPurchases.filter(p => p.id !== id) };
            return { ...prev, [speciesKey]: next };
        });
        deleteLeftoverPurchase(id).catch(() => setStatus(s => ({ ...s, [speciesKey]: "error" })));
    }, []);

    if (error) return <div style={{ padding: 24, color: "#ef4444" }}>{error}</div>;
    if (plans == null) return <div style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;

    return (
        <div style={{ padding: "20px 24px", maxWidth: 1300 }}>
            <div style={panelStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <h3 style={{ color: "#e2e8f0", margin: 0 }}>My Hunt -- {year}</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={() => setYear(y => y - 1)} style={{ ...inputStyle, width: 28, cursor: "pointer" }}>‹</button>
                        <input
                            type="number"
                            value={year}
                            onChange={e => { const v = Number(e.target.value); if (Number.isInteger(v)) setYear(v); }}
                            style={{ ...inputStyle, width: 70, textAlign: "center" }}
                        />
                        <button onClick={() => setYear(y => y + 1)} style={{ ...inputStyle, width: 28, cursor: "pointer" }}>›</button>
                    </div>
                </div>
                <div style={{ color: "#64748b", fontSize: 12, marginBottom: 10 }}>
                    Target the hunts you're planning, track your application choices, and log what actually happened in each draw. Saves automatically as you type.
                </div>

                <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                    <thead>
                        <tr>
                            <th style={{ ...thStyle, minWidth: 0 }}></th>
                            {SPECIES.map(s => (
                                <th key={s.key} style={thStyle}>
                                    {s.label}
                                    <StatusDot status={status[s.key] ?? "idle"} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={tdLabelStyle}>Target This Year</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <div style={checkboxWrapStyle}>
                                        <input
                                            type="checkbox"
                                            checked={plans[s.key].isTargeted}
                                            onChange={e => updateField(s.key, "isTargeted", e.target.checked)}
                                        />
                                    </div>
                                </td>
                            ))}
                        </tr>
                        <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                            <td style={tdLabelStyle}>Applied</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <div style={checkboxWrapStyle}>
                                        <input
                                            type="checkbox"
                                            checked={plans[s.key].hasApplied}
                                            onChange={e => updateField(s.key, "hasApplied", e.target.checked)}
                                        />
                                    </div>
                                </td>
                            ))}
                        </tr>
                        <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                            <td style={tdLabelStyle}>Current Pref. Points</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <input
                                        type="number"
                                        min={0}
                                        style={{ ...inputStyle, width: 90 }}
                                        value={plans[s.key].currentPreferencePoints ?? ""}
                                        placeholder="e.g. 5"
                                        onChange={e => {
                                            const raw = e.target.value;
                                            const parsed = raw === "" ? null : parseInt(raw, 10);
                                            updateField(s.key, "currentPreferencePoints", Number.isNaN(parsed) ? null : parsed);
                                        }}
                                    />
                                </td>
                            ))}
                        </tr>

                        <tr><td colSpan={SPECIES.length + 1} style={groupRowStyle}>Primary Draw</td></tr>
                        <tr>
                            <td style={tdLabelStyle}>Choice 1 Hunt Code</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <input
                                        style={inputStyle}
                                        value={plans[s.key].primaryChoice1HuntCode}
                                        placeholder="e.g. D-E-061-O1-A"
                                        onChange={e => updateField(s.key, "primaryChoice1HuntCode", e.target.value)}
                                    />
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td style={tdLabelStyle}>Choice 2 Hunt Code</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <input
                                        style={inputStyle}
                                        value={plans[s.key].primaryChoice2HuntCode}
                                        onChange={e => updateField(s.key, "primaryChoice2HuntCode", e.target.value)}
                                    />
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td style={tdLabelStyle}>Draw Result</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <select
                                        style={selectStyle}
                                        value={plans[s.key].primaryDrawResult}
                                        onChange={e => updateField(s.key, "primaryDrawResult", e.target.value as DrawResult)}
                                    >
                                        {DRAW_RESULT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </td>
                            ))}
                        </tr>
                        <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                            <td style={tdLabelStyle}>Hunt Code Drawn</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <input
                                        style={inputStyle}
                                        value={plans[s.key].primaryDrawnHuntCode}
                                        onChange={e => updateField(s.key, "primaryDrawnHuntCode", e.target.value)}
                                    />
                                </td>
                            ))}
                        </tr>

                        <tr><td colSpan={SPECIES.length + 1} style={groupRowStyle}>Secondary Draw</td></tr>
                        <tr>
                            <td style={tdLabelStyle}>Choice Hunt Code</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <input
                                        style={inputStyle}
                                        value={plans[s.key].secondaryChoiceHuntCode}
                                        onChange={e => updateField(s.key, "secondaryChoiceHuntCode", e.target.value)}
                                    />
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td style={tdLabelStyle}>Draw Result</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <select
                                        style={selectStyle}
                                        value={plans[s.key].secondaryDrawResult}
                                        onChange={e => updateField(s.key, "secondaryDrawResult", e.target.value as DrawResult)}
                                    >
                                        {DRAW_RESULT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </td>
                            ))}
                        </tr>
                        <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                            <td style={tdLabelStyle}>Hunt Code Drawn</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <input
                                        style={inputStyle}
                                        value={plans[s.key].secondaryDrawnHuntCode}
                                        onChange={e => updateField(s.key, "secondaryDrawnHuntCode", e.target.value)}
                                    />
                                </td>
                            ))}
                        </tr>

                        <tr><td colSpan={SPECIES.length + 1} style={groupRowStyle}>Leftover / OTC Tags</td></tr>
                        <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                            <td style={tdWrapLabelStyle}>
                                Tags (one card each -- List A/B can mean more than one per species)
                            </td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    {plans[s.key].leftoverPurchases.map(p => (
                                        <div key={p.id} style={leftoverCardStyle}>
                                            <div style={leftoverCardRowStyle}>
                                                <input
                                                    style={leftoverHuntCodeInputStyle}
                                                    value={p.huntCode}
                                                    placeholder="Hunt code"
                                                    onChange={e => updateLeftoverField(s.key, p.id, "huntCode", e.target.value)}
                                                />
                                                <input
                                                    type="date"
                                                    style={{ ...inputStyle, width: 130, flexShrink: 0 }}
                                                    value={p.purchaseDate}
                                                    onChange={e => updateLeftoverField(s.key, p.id, "purchaseDate", e.target.value)}
                                                />
                                                <button
                                                    style={removeButtonStyle}
                                                    onClick={() => handleRemoveLeftover(s.key, p.id)}
                                                    title="Remove this tag"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                            <input
                                                style={inputStyle}
                                                value={p.notes}
                                                placeholder="e.g. sold out by 9:05 a.m."
                                                onChange={e => updateLeftoverField(s.key, p.id, "notes", e.target.value)}
                                            />
                                        </div>
                                    ))}
                                    <button style={addButtonStyle} onClick={() => handleAddLeftover(s.key)}>+ Add Leftover Tag</button>
                                </td>
                            ))}
                        </tr>

                        <tr><td colSpan={SPECIES.length + 1} style={groupRowStyle}>Notes</td></tr>
                        <tr>
                            <td style={tdLabelStyle}>General Notes</td>
                            {SPECIES.map(s => (
                                <td key={s.key} style={tdStyle}>
                                    <textarea
                                        style={textareaStyle}
                                        value={plans[s.key].notes}
                                        onChange={e => updateField(s.key, "notes", e.target.value)}
                                    />
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
                </div>
            </div>
        </div>
    );
}
