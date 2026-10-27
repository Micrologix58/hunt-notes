export type HerdPopulationRow = {
    seasonYear: number;
    dau: string;
    herdName: string | null;
    gmus: string;
    populationEstimate: number;
    buckDoeRatio: number | null;
    tagQuota: number | null;
};

export async function fetchHerdPopulation(): Promise<HerdPopulationRow[]> {
    const res = await fetch("/api/herd-population");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to load herd population data");
    return json.data as HerdPopulationRow[];
}
