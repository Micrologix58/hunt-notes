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

export async function saveAccessAreaNotes(id: number, notes: string): Promise<AccessArea> {
    const res = await fetch(`/api/access-areas/${id}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to save notes");
    return json.data as AccessArea;
}
