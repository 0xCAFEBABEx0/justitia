// Writes the calendars of enforcement days and the RSS feeds of amendments (src/lib/feeds.ts) to
// <JUSTITIA_DATA>/feeds/, each as .ics and .xml:
//
//   all.*                   every amendment
//   category-<category>.*   the amendments that change a law of the category
//   law-<law ID>.*          the amendments that change the law (one pair for every law not repealed)
//
//   node scripts/feeds.ts
//
// Reads only laws.json and timeline/ (what the publish workflow caches), so it runs on every
// publish, also when the data was not extracted again: the calendars keep the past year, which
// moves with the day. scripts/upload-data.sh uploads the directory (part "feeds").
// The feeds name their own URL, under PUBLIC_DATA_BASE (https://data.anisotro.pics if unset).

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDate, laws, timeline, timelineYears } from "../src/lib/data.ts";
import { byCategory, byLaw, feedFile, feedUrl, icsCalendar, rssFeed, SITE_URL } from "../src/lib/feeds.ts";
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
const RSS_ABOUT = "改正の公布と施行のお知らせ（houritsu のデータから自動生成、非公式）。";
const publicBase = process.env.PUBLIC_DATA_BASE?.startsWith("http") ? process.env.PUBLIC_DATA_BASE : "https://data.anisotro.pics";
const rss = (file: string, name: string, description: string, pagePath: string, amendments: typeof all, lawId?: string) =>
  files.push([
    file,
    rssFeed({ name, description, pageUrl: `${SITE_URL}${pagePath}`, selfUrl: feedUrl(publicBase, file), amendments, lawId, today }),
  ]);

files.push([
  feedFile.all("ics"),
  icsCalendar({ name: `法令の施行日（${SITE_NAME}）`, description: `すべての法令の改正の施行日。${ABOUT}`, amendments: all, today }),
]);
rss(feedFile.all("xml"), `法令の改正（${SITE_NAME}）`, `すべての法令の${RSS_ABOUT}`, "/", all);
// Every category gets its files, also one with no amendment yet: the category page links them.
const perCategory = byCategory(all, lawsById);
const categories = [...new Set([...lawsById.values()].map((l) => l.category).filter((c): c is string => !!c))];
for (const category of categories) {
  const list = perCategory.get(category) ?? [];
  rss(feedFile.category(category, "xml"), `${category}の法令の改正（${SITE_NAME}）`, `分野「${category}」の法令の${RSS_ABOUT}`, `/browse/category/${encodeURIComponent(category)}/`, list);
  files.push([
    feedFile.category(category, "ics"),
    icsCalendar({ name: `${category}の法令の施行日（${SITE_NAME}）`, description: `分野「${category}」の法令の改正の施行日。${ABOUT}`, amendments: list, today }),
  ]);
}
const perLaw = byLaw(all);
for (const l of lawsById.values()) {
  if (l.status === "repealed") continue; // its page offers no calendar or feed
  rss(feedFile.law(l.id, "xml"), `${l.title}の改正（${SITE_NAME}）`, `${l.title}（${l.num}）の${RSS_ABOUT}`, `/laws/${l.id}/`, perLaw.get(l.id) ?? [], l.id);
  files.push([
    feedFile.law(l.id, "ics"),
    icsCalendar({ name: `${l.title}の施行日（${SITE_NAME}）`, description: `${l.title}（${l.num}）の改正の施行日。${ABOUT}`, amendments: perLaw.get(l.id) ?? [], lawId: l.id, today }),
  ]);
}

for (const [name, body] of files) await writeFile(join(out, name), body);
console.log(`feeds: wrote ${files.length} files to ${out} (today ${today}, ${all.length} amendments)`);
