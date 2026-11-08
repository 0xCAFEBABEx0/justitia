// Writes the calendars of upcoming enforcement days (src/lib/feeds.ts) to <JUSTITIA_DATA>/feeds/:
//
//   all.ics                 every amendment
//   category-<category>.ics the amendments that change a law of the category
//   law-<law ID>.ics        the amendments that change the law (one file for every law not repealed)
//
//   node scripts/feeds.ts
//
// Reads only laws.json and timeline/ (what the publish workflow caches), so it runs on every
// publish, also when the data was not extracted again: the calendars keep the past year, which
// moves with the day. scripts/upload-data.sh uploads the directory (part "feeds").

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDate, laws, timeline, timelineYears } from "../src/lib/data.ts";
import { byCategory, byLaw, feedFile, icsCalendar } from "../src/lib/feeds.ts";
import { SITE_NAME } from "../src/lib/site-name.ts";
import { DATA_DIR } from "../src/lib/site.ts";

const out = join(DATA_DIR, "feeds");
const today = buildDate();
const all = timelineYears().flatMap((y) => timeline(y));
const lawsById = new Map(laws().map((l) => [l.id, l]));

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const files: [string, string][] = [];
const ABOUT = "公布済みの改正が施行される日（houritsu のデータから自動生成、非公式）。";

files.push([
  feedFile.all("ics"),
  icsCalendar({ name: `法令の施行日（${SITE_NAME}）`, description: `すべての法令の改正の施行日。${ABOUT}`, amendments: all, today }),
]);
for (const [category, list] of byCategory(all, lawsById)) {
  files.push([
    feedFile.category(category, "ics"),
    icsCalendar({ name: `${category}の法令の施行日（${SITE_NAME}）`, description: `分野「${category}」の法令の改正の施行日。${ABOUT}`, amendments: list, today }),
  ]);
}
const perLaw = byLaw(all);
for (const l of lawsById.values()) {
  if (l.status === "repealed") continue; // its page offers no calendar
  files.push([
    feedFile.law(l.id, "ics"),
    icsCalendar({ name: `${l.title}の施行日（${SITE_NAME}）`, description: `${l.title}（${l.num}）の改正の施行日。${ABOUT}`, amendments: perLaw.get(l.id) ?? [], lawId: l.id, today }),
  ]);
}

for (const [name, body] of files) await writeFile(join(out, name), body);
console.log(`feeds: wrote ${files.length} files to ${out} (today ${today}, ${all.length} amendments)`);
