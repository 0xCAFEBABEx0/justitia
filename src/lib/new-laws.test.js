import assert from "node:assert/strict";
import { test } from "node:test";
import { amendmentLawIdOf, collectNewLaws, isStaged, isUpcomingNewLaw, newLawYear } from "./new-laws.ts";
const amendment = (key, enforced, laws, branch = "main") => ({
    key,
    branch,
    amendmentLawNum: `num of ${key}`,
    title: `title of ${key}`,
    enforced,
    promulgated: null,
    laws: laws.map(([id, kind]) => ({ id, title: `title of ${id}`, kind })),
    additions: 0,
    deletions: 0,
});
const summary = (id, dir) => [id, { id, dir, title: `law ${id}`, status: "in_force" }];
test("amendmentLawIdOf takes the amending law's ID from an amendment key", () => {
    assert.equal(amendmentLawIdOf("508AC0000000061_20260717"), "508AC0000000061");
    assert.equal(amendmentLawIdOf("508AC0000000061_undetermined"), "508AC0000000061");
    assert.equal(amendmentLawIdOf("507AC0000000039_20260401-2"), "507AC0000000039");
});
test("isStaged is a later part of a law coming into force by itself", () => {
    assert.equal(isStaged("amended", "A", "A"), true);
    assert.equal(isStaged("amended", "A", "B"), false);
    assert.equal(isStaged("enacted", "A", "A"), false);
});
test("collectNewLaws keeps enacted laws only, newest first, 法律 before 政令 on one day", () => {
    const laws = new Map([summary("CO1", "cabinet-order"), summary("AC1", "act"), summary("AC2", "act"), summary("M1", "ministerial-ordinance")]);
    const list = collectNewLaws([
        amendment("CO1_20260401", "2026-04-01", [["CO1", "enacted"]]),
        amendment("AC1_20260401", "2026-04-01", [["AC1", "enacted"], ["X", "amended"], ["Y", "amended"]]),
        amendment("AC1_20261001", "2026-10-01", [["AC1", "amended"]]), // 段階施行, not a new law
        amendment("Z_20250101", "2025-01-01", [["M1", "coverage_start"]]), // first covered, not new
        amendment("AC2_undetermined", null, [["AC2", "enacted"]], "upcoming"),
    ], laws, ["act", "cabinet-order", "ministerial-ordinance"]);
    assert.deepEqual(list.map((l) => l.id), ["AC1", "CO1", "AC2"]);
    assert.equal(list[0].alsoChanges, 2);
    assert.equal(list[0].amendment, "AC1_20260401");
    assert.equal(list[0].title, "law AC1");
    assert.equal(list[0].dir, "act");
});
test("collectNewLaws lists a law enacted on main once, whatever the order", () => {
    const laws = new Map([summary("AC1", "act")]);
    const main = amendment("AC1_20260401", "2026-04-01", [["AC1", "enacted"]]);
    const upcoming = amendment("AC1_20260401", "2026-04-01", [["AC1", "enacted"]], "upcoming");
    for (const order of [[main, upcoming], [upcoming, main]]) {
        const list = collectNewLaws(order, laws);
        assert.equal(list.length, 1);
        assert.equal(list[0].branch, "main");
    }
});
test("newLawYear and isUpcomingNewLaw", () => {
    assert.equal(newLawYear({ enforced: "2027-04-01" }), "2027");
    assert.equal(newLawYear({ enforced: null }), "undetermined");
    assert.equal(isUpcomingNewLaw({ branch: "upcoming", enforced: "2026-11-08" }, "2026-11-07"), true);
    assert.equal(isUpcomingNewLaw({ branch: "upcoming", enforced: "2026-11-07" }, "2026-11-07"), false);
    assert.equal(isUpcomingNewLaw({ branch: "upcoming", enforced: null }, "2026-11-07"), true);
    assert.equal(isUpcomingNewLaw({ branch: "main", enforced: "2027-01-01" }, "2026-11-07"), false);
});
