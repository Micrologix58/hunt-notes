export type Species = {
    SpeciesID: number;
    SpeciesKey: string;
    DisplayName: string;
    Category: "big_game" | "small_game";
    SortOrder: number;
};

export type DrawDateRow = {
    drawType: "primary" | "secondary";
    eventKey: string;
    eventLabel: string;
    displayText: string;
    sortOrder: number;
    notes: string | null;
};

export type BigGameSeasonRow = {
    speciesKey: string;
    speciesName: string;
    methodKey: string;
    methodLabel: string;
    displayText: string;
    sortOrder: number;
    notes: string | null;
};

export type SmallGameSeasonRow = {
    speciesKey: string;
    speciesName: string;
    seasonLabel: string;
    displayText: string;
    dailyBagLimit: string;
    possessionLimit: string;
    areaNote: string | null;
    sortOrder: number;
};

export type HomeDashboard = {
    seasonYear: number;
    species: Species[];
    drawDates: DrawDateRow[];
    bigGameSeasons: BigGameSeasonRow[];
    smallGameSeasons: SmallGameSeasonRow[];
};

export async function fetchHomeDashboard(year?: number): Promise<HomeDashboard> {
    const url = year ? `/api/home/dashboard?year=${year}` : "/api/home/dashboard";
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to load dashboard");
    return json.data as HomeDashboard;
}
