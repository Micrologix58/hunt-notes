export type DrawOddsRow = {
    species: "deer" | "elk" | "pronghorn" | "bear";
    huntCode: string;
    gmu: number | null;
    sex: string | null;          // M/F/E (decoded from the hunt code)
    method: string | null;       // A/M/R/X/P
    seasonCode: string | null;

    harvestYear: number | null;
    antleredCount: number | null;
    antlerlessCount: number | null;
    youngCount: number | null;
    totalHarvest: number | null;
    totalHunters: number | null;
    percentSuccess: number | null;
    totalRecDays: number | null;
    fewResponses: boolean;

    primaryYear: number | null;
    primaryList: string | null;
    primaryAdultResStatus: string | null;
    primaryAdultResPoints: number | null;
    primaryAdultNonResStatus: string | null;
    primaryAdultNonResPoints: number | null;
    primaryYouthResStatus: string | null;
    primaryYouthResPoints: number | null;
    primaryYouthNonResStatus: string | null;
    primaryYouthNonResPoints: number | null;
    primaryLandownerUnrestrictedStatus: string | null;
    primaryLandownerRestrictedStatus: string | null;

    secondaryYear: number | null;
    secondaryList: string | null;
    secondaryAdultResStatus: string | null;
    secondaryAdultResPoints: number | null;
    secondaryAdultNonResStatus: string | null;
    secondaryAdultNonResPoints: number | null;
    secondaryYouthResStatus: string | null;
    secondaryYouthResPoints: number | null;
    secondaryYouthNonResStatus: string | null;
    secondaryYouthNonResPoints: number | null;
    secondaryLandownerUnrestrictedStatus: string | null;
    secondaryLandownerRestrictedStatus: string | null;
};

export async function fetchDrawOdds(): Promise<DrawOddsRow[]> {
    const res = await fetch("/api/draw-odds");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to load draw odds");
    return json.data as DrawOddsRow[];
}
