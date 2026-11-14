import { test } from "node:test";
import assert from "node:assert/strict";
import { amendingLegislation, amendmentIndexable, amendmentLastmod, breadcrumbList, jsonLdText, lawLastmod, legislation } from "./seo.ts";

test("jsonLdText cannot end its <script> and parses back to the same data", () => {
  const data = { name: "a</script><script>alert(1)</script>" };
  const text = jsonLdText(data);
  assert.ok(!text.includes("<"));
  assert.deepEqual(JSON.parse(text), data);
});

test("breadcrumbList numbers the crumbs, makes their URLs absolute and ends with the page", () => {
  const ld = breadcrumbList("https://anisotro.pics", [{ href: "/browse/", label: "法令一覧" }], "民法") as {
    itemListElement: { position: number; name: string; item?: string }[];
  };
  assert.deepEqual(ld.itemListElement, [
    { "@type": "ListItem", position: 1, name: "法令一覧", item: "https://anisotro.pics/browse/" },
    { "@type": "ListItem", position: 2, name: "民法" },
  ]);
});

test("legislation states the legal force and leaves out what is unknown", () => {
  const base = {
    url: "https://anisotro.pics/laws/129AC0000000089/",
    title: "民法",
    num: "明治二十九年法律第八十九号",
    abbrev: null,
    typeLabel: "法律",
    lastAmended: "2026-04-01",
    source: null,
  };
  const inForce = legislation({ ...base, status: "in_force" }) as Record<string, unknown>;
  assert.equal(inForce.legislationLegalForce, "https://schema.org/InForce");
  assert.equal(inForce.dateModified, "2026-04-01");
  assert.ok(!("alternateName" in inForce) && !("sameAs" in inForce));
  const repealed = legislation({ ...base, status: "repealed", abbrev: "略", source: "https://laws.e-gov.go.jp/law/x" }) as Record<string, unknown>;
  assert.equal(repealed.legislationLegalForce, "https://schema.org/NotInForce");
  assert.equal(repealed.alternateName, "略");
  assert.equal(repealed.sameAs, "https://laws.e-gov.go.jp/law/x");
});

test("lawLastmod is the last amendment in force, capped at the data date", () => {
  assert.equal(lawLastmod("2025-04-01", "2026-11-09"), "2025-04-01");
  assert.equal(lawLastmod("2027-04-01", "2026-11-09"), "2026-11-09");
  assert.equal(lawLastmod(null, "2026-11-09"), undefined);
  assert.equal(lawLastmod("undetermined", "2026-11-09"), undefined);
});

test("lawLastmod leaves out dates before 1970, which Search Console rejects", () => {
  assert.equal(lawLastmod("1969-12-31", "2026-11-09"), undefined);
  assert.equal(lawLastmod("1872-11-09", "2026-11-09"), undefined);
  assert.equal(lawLastmod("1970-01-01", "2026-11-09"), "1970-01-01");
});

test("amendingLegislation lists the laws the amendment changed", () => {
  const ld = amendingLegislation({
    url: "https://anisotro.pics/amendment/426AC0000000042_20160401/",
    title: "地方自治法の一部を改正する法律",
    num: "平成二十六年法律第四十二号",
    promulgated: "2014-05-30",
    enforced: null,
    changes: [{ title: "地方自治法", num: "昭和二十二年法律第六十七号", url: "https://anisotro.pics/laws/322AC0000000067/" }],
  }) as Record<string, unknown>;
  assert.equal(ld.legislationDate, "2014-05-30");
  assert.equal(ld.legislationIdentifier, "平成二十六年法律第四十二号");
  assert.ok(!("legislationDateVersion" in ld));
  assert.deepEqual(ld.legislationChanges, [
    { "@type": "Legislation", name: "地方自治法", legislationIdentifier: "昭和二十二年法律第六十七号", url: "https://anisotro.pics/laws/322AC0000000067/" },
  ]);
});

test("amendingLegislation leaves out the law number when the amending law is unknown", () => {
  const ld = amendingLegislation({
    url: "https://anisotro.pics/amendment/000000000000000_20280613/",
    title: "事業性融資の推進等に関する法律",
    num: null,
    promulgated: "2024-06-14",
    enforced: "2028-06-13",
    changes: [],
  }) as Record<string, unknown>;
  assert.ok(!("legislationIdentifier" in ld));
});

test("amendmentLastmod is the enforcement date once in force, else the promulgation date", () => {
  assert.equal(amendmentLastmod("2025-04-01", "2024-06-12", "2026-11-14"), "2025-04-01");
  assert.equal(amendmentLastmod("2027-04-01", "2024-06-12", "2026-11-14"), "2024-06-12");
  assert.equal(amendmentLastmod(null, "2026-06-24", "2026-11-14"), "2026-06-24");
  assert.equal(amendmentLastmod("2026-11-14", null, "2026-11-14"), "2026-11-14");
});

test("amendmentLastmod leaves out unknown dates and dates before 1970", () => {
  assert.equal(amendmentLastmod(null, null, "2026-11-14"), undefined);
  assert.equal(amendmentLastmod("2027-04-01", null, "2026-11-14"), undefined);
  assert.equal(amendmentLastmod("1947-05-03", "1946-11-03", "2026-11-14"), undefined);
  assert.equal(amendmentLastmod("1970-01-01", null, "2026-11-14"), "1970-01-01");
});

test("amendmentIndexable needs a law that was amended or repealed", () => {
  assert.equal(amendmentIndexable([{ kind: "amended" }]), true);
  assert.equal(amendmentIndexable([{ kind: "repealed" }]), true);
  assert.equal(amendmentIndexable([{ kind: "enacted" }, { kind: "amended" }]), true);
  assert.equal(amendmentIndexable([{ kind: "enacted" }]), false);
  assert.equal(amendmentIndexable([{ kind: "coverage_start" }, { kind: "enacted" }]), false);
  assert.equal(amendmentIndexable([]), false);
});
