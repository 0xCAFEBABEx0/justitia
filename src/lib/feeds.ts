// Calendars (iCalendar, .ics) of the days amendments come into force, and RSS feeds of amendments
// promulgated and coming into force, for the whole site, for each category and for each law.
// scripts/feeds.ts writes them to <data>/feeds/, and the publish workflow uploads them to R2, next
// to the other data (https://data.anisotro.pics/feeds/).
//
// Every file depends only on the data and the day it is made, never on the time of the build, so a
// file that did not change is not uploaded again.

import type { AmendmentSummary, LawSummary } from "../../scripts/extract/types.ts";
import { SITE_NAME } from "./site-name.ts";

export const SITE_URL = "https://anisotro.pics";

/** The file names under feeds/: one flat directory, so one URL pattern covers every feed. */
export type FeedExt = "ics" | "xml";
export const feedFile = {
  all: (ext: FeedExt) => `all.${ext}`,
  law: (id: string, ext: FeedExt) => `law-${id}.${ext}`,
  category: (category: string, ext: FeedExt) => `category-${category}.${ext}`,
};

/** The URL of a feed file under the data base (https://data.anisotro.pics, or /data in a preview). */
export function feedUrl(dataBase: string, file: string): string {
  return `${dataBase.replace(/\/$/, "")}/feeds/${encodeURIComponent(file)}`;
}

function jpDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function addDays(iso: string, days: number): string {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

export function amendmentPageUrl(key: string, lawId?: string): string {
  return `${SITE_URL}/amendment/?k=${encodeURIComponent(key)}${lawId ? `#law-${lawId}` : ""}`;
}

/** The laws an amendment changes, for a description: 民法、商法ほか 3 法令. */
export function lawNames(a: AmendmentSummary, max = 5): string {
  const names = a.laws.slice(0, max).map((l) => l.title).join("、");
  return a.laws.length > max ? `${names}ほか ${a.laws.length - max} 法令` : names;
}

export const DISCLAIMER_LINE = `※${SITE_NAME}（非公式）が自動生成した情報です。正式な内容は e-Gov 法令検索や官報で確認してください。`;

// ---- iCalendar (RFC 5545) ----

/** Escapes a TEXT value: backslash, semicolon, comma and newlines (RFC 5545 3.3.11). */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Folds a content line to lines of at most 75 octets, continued with CRLF and a space
 * (RFC 5545 3.1). Never splits a UTF-8 character.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // the leading space of a continuation line counts
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export interface Calendar {
  /** Shown as the calendar's name in calendar apps. */
  name: string;
  description: string;
  /** The amendments to put in it; those without an enforcement date are left out. */
  amendments: AmendmentSummary[];
  /** The law a law's calendar is for: its events link to that law's part of each amendment. */
  lawId?: string;
  /** Today in Japan (YYYY-MM-DD): events from a year before it on are kept. */
  today: string;
}

/** How far back a calendar goes: the past year, so a subscription stays small. */
export const CALENDAR_PAST_DAYS = 366;

export function calendarEvents(amendments: AmendmentSummary[], today: string): AmendmentSummary[] {
  const from = addDays(today, -CALENDAR_PAST_DAYS);
  return amendments
    .filter((a) => a.enforced && a.enforced >= from)
    .sort((a, b) => a.enforced!.localeCompare(b.enforced!) || a.key.localeCompare(b.key));
}

/** One all-day event per amendment, on the day it comes into force. */
export function icsCalendar(c: Calendar): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${SITE_NAME}//Japanese law amendments//JA`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(c.name)}`,
    `NAME:${icsText(c.name)}`,
    `X-WR-CALDESC:${icsText(c.description)}`,
    `DESCRIPTION:${icsText(c.description)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    // How often to fetch again (RFC 7986, and Outlook's older property): the data changes once a day.
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];
  for (const a of calendarEvents(c.amendments, c.today)) {
    const day = a.enforced!;
    const url = amendmentPageUrl(a.key, c.lawId);
    const desc = [
      `${a.title}（${a.amendmentLawNum}）`,
      a.promulgated ? `公布：${jpDate(a.promulgated)}` : null,
      `施行：${jpDate(day)}${a.branch === "upcoming" && day > c.today ? "（予定）" : ""}`,
      `変更される法令：${lawNames(a)}`,
      url,
      DISCLAIMER_LINE,
    ].filter((l): l is string => l !== null);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${a.key}${c.lawId ? `-${c.lawId}` : ""}@anisotro.pics`,
      // Required; taken from the data, not the clock, so that the file stays the same from day to day.
      `DTSTAMP:${(a.promulgated ?? day).replace(/-/g, "")}T000000Z`,
      `DTSTART;VALUE=DATE:${day.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${addDays(day, 1).replace(/-/g, "")}`,
      `SUMMARY:${icsText(`施行：${a.title}`)}`,
      `DESCRIPTION:${icsText(desc.join("\n"))}`,
      `URL:${url}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ---- RSS 2.0 (https://www.rssboard.org/rss-specification) ----

export function xmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Midnight in Japan on a day, as RFC 822 dates are written in RSS: Wed, 24 Jun 2026 00:00:00 +0900. */
export function rfc822(iso: string): string {
  const t = new Date(`${iso}T00:00:00Z`);
  const [y, m, d] = iso.split("-");
  return `${DAYS[t.getUTCDay()]}, ${d} ${MONTHS[Number(m) - 1]} ${y} 00:00:00 +0900`;
}

/** One entry of a feed: an amendment promulgated, or an amendment coming into force. */
export interface FeedItem {
  kind: "promulgated" | "enforced";
  day: string;
  amendment: AmendmentSummary;
}

/**
 * Each amendment gives up to two items, each on its day, so a reader hears of it when it is
 * promulgated (as soon as houritsu has it) and again when it comes into force: the promulgation,
 * and the entry into force once that day has come. An amendment in force on the day it is promulgated
 * gives one item. Items from the past year (CALENDAR_PAST_DAYS) are kept, newest first, but no more
 * than about RSS_MAX_ITEMS (see below).
 */
export function feedItems(amendments: AmendmentSummary[], today: string): FeedItem[] {
  const from = addDays(today, -CALENDAR_PAST_DAYS);
  const items: FeedItem[] = [];
  for (const a of amendments) {
    if (a.promulgated && a.promulgated !== a.enforced && a.promulgated >= from && a.promulgated <= today) items.push({ kind: "promulgated", day: a.promulgated, amendment: a });
    if (a.enforced && a.enforced >= from && a.enforced <= today) items.push({ kind: "enforced", day: a.enforced, amendment: a });
  }
  // Newest first; on one day, entries into force before promulgations, then by key.
  items.sort((x, y) => y.day.localeCompare(x.day) || x.kind.localeCompare(y.kind) || x.amendment.key.localeCompare(y.amendment.key));
  if (items.length <= RSS_MAX_ITEMS) return items;
  // A long feed is cut, but never inside a day: a day with more items than the limit (such as
  // 1 April, when hundreds of amendments come into force) is kept whole, so no reader misses one.
  const lastDay = items[RSS_MAX_ITEMS - 1].day;
  return items.filter((i) => i.day >= lastDay);
}

/**
 * How many items a feed keeps, plus the rest of the day the last of them falls on (so a feed can hold
 * more). The site-wide feed has about 3,500 items
 * a year (3 MB); feed readers fetch every few hours and need only the latest, and the law feeds stay
 * well under it, so they keep their whole year.
 */
export const RSS_MAX_ITEMS = 200;

export interface Feed {
  /** The channel's title, shown as the feed's name in readers. */
  name: string;
  description: string;
  /** The page on the site the feed belongs to. */
  pageUrl: string;
  /** The feed's own URL. */
  selfUrl: string;
  amendments: AmendmentSummary[];
  /** The law a law's feed is for: its items link to that law's part of each amendment. */
  lawId?: string;
  /** Today in Japan (YYYY-MM-DD). */
  today: string;
}

export function rssFeed(f: Feed): string {
  const items = feedItems(f.amendments, f.today);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${xmlText(f.name)}</title>`,
    `<link>${xmlText(f.pageUrl)}</link>`,
    `<description>${xmlText(f.description)}</description>`,
    "<language>ja</language>",
    `<atom:link href="${xmlText(f.selfUrl)}" rel="self" type="application/rss+xml" />`,
    // The newest item's day, not the time of the build, so an unchanged feed is not uploaded again.
    ...(items.length ? [`<lastBuildDate>${rfc822(items[0].day)}</lastBuildDate>`] : []),
    "<ttl>720</ttl>",
  ];
  for (const { kind, day, amendment: a } of items) {
    const url = amendmentPageUrl(a.key, f.lawId);
    const title =
      kind === "enforced"
        ? `${a.promulgated === a.enforced ? "公布・施行" : "施行"}：${a.title}`
        : `公布：${a.title}（${a.enforced ? `${jpDate(a.enforced)}施行${a.enforced > f.today ? "予定" : ""}` : "施行日未定"}）`;
    const desc = [
      `${a.title}（${a.amendmentLawNum}）`,
      a.promulgated ? `公布：${jpDate(a.promulgated)}` : null,
      `施行：${a.enforced ? `${jpDate(a.enforced)}${a.enforced > f.today ? "（予定）" : ""}` : "未定"}`,
      `変更される法令：${lawNames(a)}`,
      DISCLAIMER_LINE,
    ].filter((l): l is string => l !== null);
    out.push(
      "<item>",
      `<title>${xmlText(title)}</title>`,
      `<link>${xmlText(url)}</link>`,
      // The description is HTML, escaped once more as XML text.
      `<description>${xmlText(desc.map(xmlText).join("<br>"))}</description>`,
      `<guid isPermaLink="false">${xmlText(`${a.key}${f.lawId ? `-${f.lawId}` : ""}-${kind}@anisotro.pics`)}</guid>`,
      `<pubDate>${rfc822(day)}</pubDate>`,
      "</item>",
    );
  }
  out.push("</channel>", "</rss>");
  return out.join("\n") + "\n";
}

/** The amendments that change any law of a category. */
export function byCategory(amendments: AmendmentSummary[], lawsById: Map<string, LawSummary>): Map<string, AmendmentSummary[]> {
  const out = new Map<string, AmendmentSummary[]>();
  for (const a of amendments) {
    const cats = new Set(a.laws.map((l) => lawsById.get(l.id)?.category).filter((c): c is string => !!c));
    for (const c of cats) {
      if (!out.has(c)) out.set(c, []);
      out.get(c)!.push(a);
    }
  }
  return out;
}

/** The amendments that change each law. */
export function byLaw(amendments: AmendmentSummary[]): Map<string, AmendmentSummary[]> {
  const out = new Map<string, AmendmentSummary[]>();
  for (const a of amendments) {
    for (const l of a.laws) {
      if (!out.has(l.id)) out.set(l.id, []);
      out.get(l.id)!.push(a);
    }
  }
  return out;
}
