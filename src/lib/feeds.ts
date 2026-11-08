// Calendars (iCalendar, .ics) of the days amendments come into force, for the whole site, for each
// category and for each law. scripts/feeds.ts writes them to <data>/feeds/, and the publish
// workflow uploads them to R2, next to the other data (https://data.anisotro.pics/feeds/).
//
// Every file depends only on the data and the day it is made, never on the time of the build, so a
// file that did not change is not uploaded again.

import type { AmendmentSummary, LawSummary } from "../../scripts/extract/types.ts";
import { SITE_NAME } from "./site-name.ts";

export const SITE_URL = "https://anisotro.pics";

/** The file names under feeds/: one flat directory, so one URL pattern covers every feed. */
export const feedFile = {
  all: (ext: "ics") => `all.${ext}`,
  law: (id: string, ext: "ics") => `law-${id}.${ext}`,
  category: (category: string, ext: "ics") => `category-${category}.${ext}`,
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
