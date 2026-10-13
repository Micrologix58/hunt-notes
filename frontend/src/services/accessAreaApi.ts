export type AccessArea = {
    id: number;
    name: string;
    areaType: "SWA" | "STL";
    county: string;
    gmus: string;
    primaryGmu: number | null;
    acresTotal: number | null;
    distanceFromDenverMiles: number | null;
    recreation: string;
    facilities: string;
    campingAllowed: boolean;
    restrictions: string;
    notes: string;
    sourcePage: number | null;
    updatedAt: string | null;
    species: string[];
};

export async function fetchAccessAreas(): Promise<AccessArea[]> {
    const res = await fetch("/api/access-areas");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to load access areas");
    return json.data as AccessArea[];
}

export async function fetchAccessAreaSpeciesList(): Promise<string[]> {
    const res = await fetch("/api/access-areas/species");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to load species list");
    return json.data as string[];
}

// Notes and campingAllowed are the only user-editable fields -- pass just
// the one that changed (the other keeps its current value server-side).
export async function saveAccessArea(id: number, fields: Partial<Pick<AccessArea, "notes" | "campingAllowed">>): Promise<AccessArea> {
    const res = await fetch(`/api/access-areas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to save");
    return json.data as AccessArea;
}
