// Repealed laws (廃止された法令), found in the timeline: a law whose file is deleted from houritsu's
// main branch (FileChangeKind "repealed"). houritsu has repeals from 2017 on only: laws repealed before
// e-Gov's data begins are not in it at all.
import { amendmentLawIdOf } from "./new-laws.ts";
export const REPEAL_WAYS = ["new_law", "repeal_law", "other"];
export const REPEAL_WAY_LABELS = {
    new_law: "新しい法令の施行に伴う廃止",
    repeal_law: "廃止のための法令",
    other: "改正法令の附則などによる廃止",
};
/**
 * Every law repealed on main and still repealed, newest repeal first (undetermined dates last), and on
 * one day in the order of `typeOrder` (directories under laws/), then by title. A law repealed, added
 * again and repealed again is listed once, at its last repeal.
 */
export function collectRepealedLaws(amendments, lawsById, typeOrder = []) {
    const typeRank = (dir) => {
        const i = typeOrder.indexOf(dir);
        return i < 0 ? typeOrder.length : i;
    };
    const found = new Map();
    for (const a of amendments) {
        if (a.branch !== "main")
            continue;
        const repealed = a.laws.filter((l) => l.kind === "repealed");
        if (repealed.length === 0)
            continue;
        const amendingId = amendmentLawIdOf(a.key);
        // houritsu has a file for the amending law only when it is a law of its own (a new law), not
        // just a set of amendments; one enacted in this very commit may be missing from lawsById.
        const enacted = a.laws.find((l) => l.kind === "enacted" && l.id === amendingId);
        const amending = lawsById.get(amendingId) ?? enacted;
        for (const l of repealed) {
            const summary = lawsById.get(l.id);
            if (summary && summary.status !== "repealed")
                continue; // in force again
            const prev = found.get(l.id);
            if (prev && (prev.enforced ?? "") > (a.enforced ?? ""))
                continue;
            const newLaw = amending && amendingId !== l.id ? { id: amendingId, title: amending.title } : null;
            found.set(l.id, {
                id: l.id,
                title: summary?.title || l.title,
                num: summary?.num ?? "",
                dir: summary?.dir ?? "",
                enforced: a.enforced,
                promulgated: a.promulgated,
                amendment: a.key,
                amendmentTitle: a.title,
                amendmentLawNum: a.amendmentLawNum,
                way: newLaw ? "new_law" : isRepealLawTitle(a.title) ? "repeal_law" : "other",
                newLaw,
                alsoRepeals: repealed.length - 1,
            });
        }
    }
    return [...found.values()].sort((x, y) => (y.enforced ?? "").localeCompare(x.enforced ?? "") ||
        typeRank(x.dir) - typeRank(y.dir) ||
        x.title.localeCompare(y.title, "ja"));
}
/**
 * Whether the title of an amending law says it is made to repeal laws: it ends in 「〜を廃止する省令」,
 * 「〜を廃止する等の法律」 or 「〜の廃止等に関する省令」 and the like. 廃止 elsewhere in a title is mostly in the
 * name of another law, as in 「〜を廃止する法律の施行に伴う関係省令の整備に関する省令」. The 人事院 repeals its
 * rules by adding them to the list in 人事院規則一―四（現行の法律、命令及び規則の廃止）, so an amendment of
 * that rule is a repeal too.
 */
export function isRepealLawTitle(title) {
    return (/(を廃止する(等の)?|の廃止等?に関する)(法律|[^、。（）]{0,5}(令|規則))$/.test(title) ||
        title.startsWith("人事院規則一―四（現行の法律、命令及び規則の廃止）の一部を改正する"));
}
/** The year of a repeal, or "undetermined". */
export function repealYear(l) {
    return l.enforced?.slice(0, 4) ?? "undetermined";
}
/**
 * The amendment key of the last text in force before a law's repeal (for /versions/?at=), or null
 * when houritsu has no text before it.
 */
export function lastTextBeforeRepeal(revisions) {
    const main = revisions.filter((r) => r.branch === "main");
    const at = main.findLastIndex((r) => r.kind === "repealed");
    return at > 0 ? main[at - 1].amendment : null;
}
