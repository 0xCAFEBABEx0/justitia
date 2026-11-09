// Structured data (JSON-LD, https://schema.org) for search engines, and the sitemap's lastmod.
// Google reads JSON-LD anywhere in the page: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data

/**
 * A JSON-LD <script> body. JSON.stringify leaves "<" as it is, so "</script>" in a law title
 * would end the script: every "<" becomes the escape \u003c, which JSON parsers read back as "<".
 */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * schema.org BreadcrumbList for a page's breadcrumbs and the page itself (the last item has no
 * URL, as Google allows: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb).
 */
export function breadcrumbList(site: URL | string, crumbs: { href: string; label: string }[], current: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      ...crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: new URL(c.href, site).href })),
      { "@type": "ListItem", position: crumbs.length + 1, name: current },
    ],
  };
}

export interface LegislationFacts {
  url: string;
  title: string;
  num: string;
  abbrev: string | null;
  typeLabel: string;
  status: "in_force" | "repealed" | "upcoming_only";
  /** Enforcement date of the latest revision in force (YYYY-MM-DD). */
  lastAmended: string | null;
  /** The law on e-Gov 法令検索. */
  source: string | null;
}

/** schema.org Legislation (https://schema.org/Legislation) for a law page. */
export function legislation(f: LegislationFacts): object {
  return {
    "@context": "https://schema.org",
    "@type": "Legislation",
    "@id": `${f.url}#legislation`,
    url: f.url,
    name: f.title,
    ...(f.abbrev ? { alternateName: f.abbrev } : {}),
    legislationIdentifier: f.num,
    legislationType: f.typeLabel,
    legislationJurisdiction: "JP",
    inLanguage: "ja",
    legislationLegalForce: f.status === "in_force" ? "https://schema.org/InForce" : "https://schema.org/NotInForce",
    ...(f.lastAmended ? { dateModified: f.lastAmended } : {}),
    ...(f.source ? { sameAs: f.source } : {}),
  };
}

/**
 * The sitemap's lastmod for a law page: the day its latest revision came into force, which is when
 * the text on the page last changed. Never later than the data (an amendment dated in the future
 * is not in force yet), and nothing when the law has no such date.
 */
export function lawLastmod(lastAmended: string | null, dataDate: string): string | undefined {
  if (!lastAmended || !/^\d{4}-\d{2}-\d{2}$/.test(lastAmended)) return undefined;
  return lastAmended > dataDate ? dataDate : lastAmended;
}

export interface AmendingLawFacts {
  url: string;
  title: string;
  num: string;
  promulgated: string | null;
  enforced: string | null;
  /** The laws it changed, with their pages on this site. */
  changes: { title: string; num: string; url: string }[];
}

/**
 * schema.org Legislation for an amendment page: the amending law, the day it was promulgated, and the laws it
 * changed (legislationChanges).
 */
export function amendingLegislation(f: AmendingLawFacts): object {
  return {
    "@context": "https://schema.org",
    "@type": "Legislation",
    "@id": `${f.url}#legislation`,
    url: f.url,
    name: f.title,
    legislationIdentifier: f.num,
    legislationJurisdiction: "JP",
    inLanguage: "ja",
    ...(f.promulgated ? { legislationDate: f.promulgated } : {}),
    ...(f.enforced ? { legislationDateVersion: f.enforced } : {}),
    legislationChanges: f.changes.map((c) => ({ "@type": "Legislation", name: c.title, legislationIdentifier: c.num, url: c.url })),
  };
}
