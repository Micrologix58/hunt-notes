export type BearGmuStatsRow = {
    seasonYear: number;
    gmu: number;
    tagQuota: number | null;
    harvest: number | null;
};

export async function fetchBearGmuStats(): Promise<BearGmuStatsRow[]> {
    const res = await fetch("/api/bear-gmu-stats");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to load bear GMU stats");
    return json.data as BearGmuStatsRow[];
}
