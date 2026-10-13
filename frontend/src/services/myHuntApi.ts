export type DrawResult = "pending" | "drawn" | "not_drawn";

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

    leftoverHuntCode: string;
    leftoverPurchased: boolean;
    leftoverPurchaseDate: string;
    leftoverNotes: string;

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
