// Calendars (iCalendar, .ics) of the days amendments come into force, and RSS feeds of amendments
// promulgated and coming into force, for the whole site, for each category and for each law.
// scripts/feeds.ts writes them to <data>/feeds/, and the publish workflow uploads them to R2, next
// to the other data (https://data.anisotro.pics/feeds/).
//
// Every file depends only on the data and the day it is made, never on the time of the build, so a
// file that did not change is not uploaded again.

import type { AmendmentSummary, LawSummary } from "../../scripts/extract/types.ts";
import { SITE_NAME } from "./site-name.ts";
import { amendingLawNum } from "./law-num.ts";

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

// Icons for the menu and the buttons that offer these feeds. They are Heroicons 2.2.0 (24 × 24
// outline, https://heroicons.com), the set daisyUI's documentation uses, with their paths
// unchanged. Their license:
//
// MIT License
//
// Copyright (c) Tailwind Labs, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
const FEED_ICON_PATHS = {
  /** calendar-days: the calendar to subscribe to */
  calendar: '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"/>',
  /** document-arrow-down: the .ics file */
  file: '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>',
  /** rss: the RSS feed */
  rss: '<path stroke-linecap="round" stroke-linejoin="round" d="M12.75 19.5v-.75a7.5 7.5 0 0 0-7.5-7.5H4.5m0-6.75h.75c7.87 0 14.25 6.38 14.25 14.25v.75M6 18.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"/>',
  /** question-mark-circle: how to subscribe */
  help: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"/>',
};

/** A decorative feed icon as SVG markup: 20 px for a menu item (as in the share menu), "h-4 w-4" in a button. */
export function feedIcon(name: keyof typeof FEED_ICON_PATHS, size = "h-5 w-5"): string {
  return `<svg class="${size} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${FEED_ICON_PATHS[name]}</svg>`;
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
  return `${SITE_URL}/amendment/${encodeURIComponent(key)}/${lawId ? `#law-${lawId}` : ""}`;
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
      `${a.title}（${amendingLawNum(a.amendmentLawNum)}）`,
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
      `${a.title}（${amendingLawNum(a.amendmentLawNum)}）`,
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
