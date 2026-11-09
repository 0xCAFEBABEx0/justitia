// Newly enacted laws (新しく制定された法令), found in the timeline: a law whose file first appears in
// houritsu through the law itself (FileChangeKind "enacted"). Laws that only start being covered
// through some other revision ("coverage_start") are not new laws and are left out.
/**
 * The ID of the amending law of an amendment, from its key (`<Amendment-Law-Id>_<YYYYMMDD | undetermined>`,
 * maybe with `-2`, `-3`, ...; see scripts/extract/types.ts). Law IDs have no "_".
 */
export function amendmentLawIdOf(key) {
    const i = key.lastIndexOf("_");
    return i < 0 ? key : key.slice(0, i);
}
/**
 * Whether a change is a later part of a law coming into force in stages (段階施行): the amending law
 * is the law itself, but the law was already there. houritsu records the first part as the
 * enactment and every later part as a revision of the law by itself.
 */
export function isStaged(kind, lawId, amendmentLawId) {
    return kind === "amended" && lawId === amendmentLawId;
}
/**
 * Every newly enacted law in the timeline, newest enforcement first (undetermined dates last), and
 * on one day in the order of `typeOrder` (directories under laws/), then by title. A law enacted on
 * main is listed once, even if the upcoming branch also adds it.
 */
export function collectNewLaws(amendments, lawsById, typeOrder = []) {
    const typeRank = (dir) => {
        const i = typeOrder.indexOf(dir);
        return i < 0 ? typeOrder.length : i;
    };
    const found = new Map();
    for (const a of amendments) {
        const enacted = a.laws.find((l) => l.kind === "enacted");
        if (!enacted)
            continue;
        const prev = found.get(enacted.id);
        if (prev && (prev.branch === "main" || a.branch === "upcoming"))
            continue;
        const summary = lawsById.get(enacted.id);
        found.set(enacted.id, {
            id: enacted.id,
            title: summary?.title ?? enacted.title,
            num: a.amendmentLawNum,
            dir: summary?.dir ?? "",
            status: summary?.status ?? null,
            branch: a.branch,
            enforced: a.enforced,
            promulgated: a.promulgated,
            amendment: a.key,
            alsoChanges: a.laws.length - 1,
        });
    }
    return [...found.values()].sort((x, y) => (y.enforced ?? "").localeCompare(x.enforced ?? "") ||
        typeRank(x.dir) - typeRank(y.dir) ||
        x.title.localeCompare(y.title, "ja"));
}
/** The year of a new law's enforcement date, or "undetermined": the /new/<year>/ page it is on. */
export function newLawYear(l) {
    return l.enforced?.slice(0, 4) ?? "undetermined";
}
/** Whether a new law is promulgated but not in force yet on `today` (YYYY-MM-DD). */
export function isUpcomingNewLaw(l, today) {
    return l.branch === "upcoming" && (!l.enforced || l.enforced > today);
}
