// Writes the law bills pending in the Diet to <JUSTITIA_DATA>/bills.json (src/lib/bills.ts), for the
// law pages to show.
//
//   node scripts/bills.ts
//
// The source is the House of Representatives bill database of SmartNews Media Research Institute
// (MIT), which updates it from the 衆議院 website around 23:00 JST every day. The publish workflow runs
// this before every build. When the download fails, it removes the file and exits 0, so the site is
// still published, without pending bills, instead of showing stale ones.

import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pendingBills, type BillsFile } from "../src/lib/bills.ts";
import { DATA_DIR } from "../src/lib/site.ts";
import { jstDate } from "../src/lib/data.ts";

const BASE = "https://raw.githubusercontent.com/smartnews-smri/house-of-representatives/main/data/";
const out = join(DATA_DIR, "bills.json");

async function get(file: string): Promise<unknown> {
  const res = await fetch(BASE + file, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

try {
  const [rows, time] = await Promise.all([get("gian.json"), get("updatetime.json")]);
  // "2026-11-13 14:07:48", in UTC (the database's job runs at 14:07 UTC).
  const stamp = (time as { file_update?: string }).file_update ?? "";
  if (!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(stamp)) throw new Error(`updatetime.json: unexpected ${JSON.stringify(time)}`);
  const file: BillsFile = { updated: jstDate(`${stamp.replace(" ", "T")}Z`), bills: pendingBills(rows as string[][]) };
  await writeFile(out, JSON.stringify(file));
  console.log(`bills: ${file.bills.length} pending law bills (data of ${file.updated})`);
} catch (e) {
  await rm(out, { force: true });
  const message = `bills: not written, the law pages show no pending bills (${(e as Error).message})`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message);
}
