export type WalkInArea = {
    id: number;
    seasonYear: number;
    slug: string;
    label: string;
    county: string;
    gmu: number | null;
    bigGame: boolean;
    landType: string;
    parcelCount: number;
    locator: string;
    sourcePage: number | null;
    owner: string;
    notes: string;
    scouted: boolean;
    updatedAt: string | null;
};

export async function fetchWalkInAreas(): Promise<WalkInArea[]> {
    const res = await fetch("/api/walkin-areas");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to load Walk-In areas");
    return json.data as WalkInArea[];
}

// Owner, Notes and Scouted are the only user-editable fields -- pass just
// the one that changed (the others keep their current value server-side).
export async function saveWalkInArea(id: number, fields: Partial<Pick<WalkInArea, "owner" | "notes" | "scouted">>): Promise<WalkInArea> {
    const res = await fetch(`/api/walkin-areas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to save");
    return json.data as WalkInArea;
}
