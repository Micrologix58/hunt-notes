export type DrawResult = "pending" | "drawn" | "not_drawn";

export type LeftoverPurchase = {
    id: number;
    seasonYear: number;
    speciesKey: "deer" | "elk" | "pronghorn";
    huntCode: string;
    purchaseDate: string;
    notes: string;
};

export type MyHuntPlan = {
    seasonYear: number;
    speciesKey: "deer" | "elk" | "pronghorn";
    isTargeted: boolean;
    hasApplied: boolean;

    primaryChoice1HuntCode: string;
    primaryChoice2HuntCode: string;
    primaryDrawResult: DrawResult;
    primaryDrawnHuntCode: string;

    secondaryChoiceHuntCode: string;
    secondaryDrawResult: DrawResult;
    secondaryDrawnHuntCode: string;

    // Leftover/OTC tags aren't bounded to one per species/year -- List A/B
    // hunts can let you hold more than one (see schema.sql).
    leftoverPurchases: LeftoverPurchase[];

    notes: string;
    updatedAt: string | null;
};

export async function fetchMyHuntPlans(year: number): Promise<MyHuntPlan[]> {
    const res = await fetch(`/api/my-hunt/plans?year=${year}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to load hunt plans");
    return json.data as MyHuntPlan[];
}

export async function saveMyHuntPlan(year: number, speciesKey: string, plan: Partial<MyHuntPlan>): Promise<MyHuntPlan> {
    const res = await fetch(`/api/my-hunt/plans/${speciesKey}?year=${year}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to save hunt plan");
    return json.data as MyHuntPlan;
}

export async function addLeftoverPurchase(year: number, speciesKey: string): Promise<LeftoverPurchase> {
    const res = await fetch(`/api/my-hunt/leftover-purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonYear: year, speciesKey, huntCode: "", purchaseDate: "", notes: "" }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to add leftover purchase");
    return json.data as LeftoverPurchase;
}

export async function saveLeftoverPurchase(id: number, fields: Pick<LeftoverPurchase, "huntCode" | "purchaseDate" | "notes">): Promise<LeftoverPurchase> {
    const res = await fetch(`/api/my-hunt/leftover-purchases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to save leftover purchase");
    return json.data as LeftoverPurchase;
}

export async function deleteLeftoverPurchase(id: number): Promise<void> {
    const res = await fetch(`/api/my-hunt/leftover-purchases/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to delete leftover purchase");
}
