// /llms.txt (https://llmstxt.org/): a Markdown summary of the site for AI search engines and
// assistants that read a page for a person. It says what the site is, how its URLs are formed,
// where the main pages are, and the same sources, licenses and disclaimer as the about page
// (attribution as houritsu's README gives it: 出典 first, then the licenses).

import { BILLS_LICENSE_URL, BILLS_SOURCE_CREDIT, BILLS_SOURCE_NAME, BILLS_SOURCE_URL } from "./bills.ts";
import { DISCLAIMER_URL, EGOV_URL } from "./disclaimer.ts";
import { NAV_GROUPS, type NavGroup } from "./nav.ts";
import { CODE_LICENSE_URL, CODE_REPO, DATA_LICENSE_URL, PDL_URL, SITE_NAME, SITE_TAGLINE, SOURCE_REPO } from "./site.ts";

/** A law shown as the example of a law page URL. */
const EXAMPLE_LAW = { id: "129AC0000000089", title: "民法" };

export interface LlmsTxtInput {
  /** The site's origin, without a trailing slash (https://anisotro.pics). */
  site: string;
  /** The data date, already written in Japanese (2026年11月15日). */
  updated: string;
  /** Number of laws in force. */
  lawsInForce: number;
}

function links(site: string, group: NavGroup | undefined): string[] {
  return (group?.items ?? []).map((i) => `- [${i.label}](${site}${i.href})${i.desc ? `: ${i.desc}` : ""}`);
}

export function llmsTxt({ site, updated, lawsInForce }: LlmsTxtInput): string {
  const group = (id: NavGroup["id"]) => NAV_GROUPS.find((g) => g.id === id);
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_TAGLINE}を見るための非公式のサイトです。e-Gov 法令検索の法令データを Git の履歴にした houritsu から毎日生成し、現行の法令の条文、改正ごとの新旧対照、施行予定の改正、国会で審議中の法律案を載せています。`,
    "",
    `- 条文と新旧対照はプログラムで自動生成しているため、誤りを含むことがあります。正式な内容は e-Gov 法令検索（${EGOV_URL}）で確認してください。`,
    `- データの日付：${updated}。現行の法令 ${lawsInForce.toLocaleString("en-US")} 件。`,
    "- 法令ID は e-Gov 法令検索の法令ID と同じです。",
    "",
    "## ページの URL",
    "",
    `- 法令の条文：${site}/laws/<法令ID>/（例：[${EXAMPLE_LAW.title}](${site}/laws/${EXAMPLE_LAW.id}/)）。見出しごとのアンカー、改正の履歴、定義している用語、引用している法令と引用されている法令も載せています。`,
    `- 改正の新旧対照：${site}/amendment/<改正法令の法令ID>_<施行日 YYYYMMDD>/（施行日が決まっていない改正は undetermined）。法令ページの改正の履歴からリンクしています。`,
    `- 法令用語の定義：${site}/terms/<用語>/`,
    `- サイトマップ：${site}/sitemap-index.xml`,
    "",
    "## 法令を探す",
    "",
    ...links(site, group("find")),
    "",
    "## 改正・施行",
    "",
    ...links(site, group("change")),
    "",
    "## 統計",
    "",
    ...links(site, group("stats")),
    "",
    "## 出典とライセンス",
    "",
    `- 出典：e-Gov 法令検索（${EGOV_URL}）、PDL1.0（${PDL_URL}）`,
    `- 条文と改正履歴は、Kohei-Wada 氏の houritsu（${SOURCE_REPO}、CC BY 4.0）のデータを加工して作成しています。`,
    `- 本サイトのデータは CC BY 4.0（${DATA_LICENSE_URL}）で提供します。再利用するときは、houritsu と e-Gov 法令検索を出典として示してください。`,
    `- 審議中の法律案は、${BILLS_SOURCE_NAME}（${BILLS_SOURCE_CREDIT}、MIT ライセンス、${BILLS_SOURCE_URL}）をもとに、議案の番号・件名・審議の経過と衆議院のページへのリンクのみを載せています。この部分は本サイトの CC BY 4.0 の対象外です（${BILLS_LICENSE_URL}）。`,
    `- 本サイトのプログラムは GNU AGPL v3.0（${CODE_LICENSE_URL}）で公開しています。ソースコード：${CODE_REPO}`,
    `- 免責事項：本サイトの利用により生じた損害について、管理者は一切の責任を負いません（${site}${DISCLAIMER_URL}）。`,
    "",
    "## Optional",
    "",
    `- [このサイトについて](${site}/about/): 見られるもの、注意、免責事項、出典とライセンス`,
    "",
  ];
  return lines.join("\n");
}
