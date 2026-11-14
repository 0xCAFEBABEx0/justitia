// The terms on the /terms/ pages, from the definitions scanLaws finds (see terms.ts): every term that
// at least MIN_LAWS laws in force define, with each law's definition.

import { laws, lawUrl, TYPE_ORDER, type LawSummary } from "./data.ts";
import { listTitle, scanLaws } from "./stats.ts";
import type { Definition, DefinitionSource } from "./terms.ts";

/** A term gets a page when this many laws in force define it. */
export const MIN_LAWS = 5;

export interface TermLaw {
  id: string;
  title: string;
  dir: string;
  def: Definition;
  /** The law page, at the article with the definition. */
  href: string;
  /** The article as the law page heads it: 第二条. */
  article: string;
  /** For a definition by reference to another law, that law's provision. */
  source?: TermSource;
}

/** The provision of another law that a definition refers to, as shown: 地方自治法 第二百五十二条の十九第一項. */
export interface TermSource {
  law: string;
  provision: string;
  /** The law page at the article, when the law is in force. */
  href?: string;
}

export interface Term {
  term: string;
  /** The laws that define it: 憲法 and 法律 first, then 政令 and the rest, the most cited first within a type. */
  laws: TermLaw[];
  /** How many of them are 法律 (or the constitution). */
  acts: number;
}

/** The URL of a term's page. */
export function termUrl(term: string): string {
  return `/terms/${encodeURIComponent(term)}/`;
}

/** The article of a block key, as the law page heads it: 「本則|第二条」 → 第二条, 「本則|第一章|第二条#2」 → 第二条. */
export function articleLabel(block: string): string {
  return (block.split("|").pop() ?? "").replace(/#\d+$/, "");
}

const isAct = (l: { dir: string }) => l.dir === "act" || l.dir === "constitution";

interface TermIndex {
  terms: Term[];
  byTerm: Map<string, Term>;
  /** For each law, the terms with a page that it defines, the most widely defined first. */
  byLaw: Map<string, string[]>;
}

let cache: TermIndex | null = null;
/** Every term with a page, the most widely defined first. */
export function termIndex(): TermIndex {
  if (cache) return cache;
  const scan = scanLaws();
  const byId = new Map<string, LawSummary>(laws().map((l) => [l.id, l]));
  const cited = (id: string) => scan.citedBy.get(id)?.length ?? 0;
  const rank = (l: LawSummary) => TYPE_ORDER.indexOf(l.dir);
  const byTitle = new Map<string, string | null>();
  for (const l of laws()) if (l.status === "in_force") byTitle.set(l.title, byTitle.has(l.title) ? null : l.id);
  const sourceOf = (s: DefinitionSource): TermSource => {
    const id = byTitle.get(s.law);
    if (!id) return { law: s.law, provision: s.provision };
    const article = /^第[〇一二三四五六七八九十百千]+条(?:の[〇一二三四五六七八九十百千]+)*/.exec(s.provision)?.[0];
    const key = article && scan.articles.get(id)?.get(article);
    return { law: s.law, provision: s.provision, href: `${lawUrl(id)}${key ? `#${encodeURIComponent(key)}` : ""}` };
  };
  const terms: Term[] = [];
  for (const [term, uses] of scan.definitions) {
    if (uses.length < MIN_LAWS) continue;
    const list = uses
      .map(({ id, def }) => ({ law: byId.get(id)!, def }))
      .sort((a, b) => rank(a.law) - rank(b.law) || cited(b.law.id) - cited(a.law.id) || (a.law.id < b.law.id ? -1 : 1))
      .map(({ law, def }) => ({
        id: law.id,
        title: listTitle(law.title, law.num),
        dir: law.dir,
        def,
        href: `${lawUrl(law.id)}#${encodeURIComponent(def.block)}`,
        article: articleLabel(def.block),
        ...(def.source ? { source: sourceOf(def.source) } : {}),
      }));
    terms.push({ term, laws: list, acts: list.filter(isAct).length });
  }
  terms.sort((a, b) => b.laws.length - a.laws.length || b.acts - a.acts || (a.term < b.term ? -1 : 1));
  const byLaw = new Map<string, string[]>();
  for (const t of terms) {
    for (const l of t.laws) {
      const list = byLaw.get(l.id);
      if (list) list.push(t.term);
      else byLaw.set(l.id, [t.term]);
    }
  }
  cache = { terms, byTerm: new Map(terms.map((t) => [t.term, t])), byLaw };
  return cache;
}

/**
 * What a definition by reference says in parentheses beyond the reference: 「法人税法（昭和四十年法律
 * 第三十四号）第二条第四号に規定する外国法人（公益法人等を除く。）」 → 公益法人等を除く。 The number
 * of the law and a short name given to it (以下「法」という。) are not part of it.
 */
export function qualifiers(text: string): string {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "（" && depth++ === 0) start = i + 1;
    else if (text[i] === "）" && depth > 0 && --depth === 0) {
      const inner = text.slice(start, i);
      if (!/^(?:(?:明治|大正|昭和|平成|令和)[元〇一二三四五六七八九十]+年[^（）。]*第[〇一二三四五六七八九十百千]+号。?)?(?:[^。「」]*「[^「」]*」という。?)?$/.test(inner)) out.push(inner);
    }
  }
  return out.join("\n");
}

/**
 * A term's laws grouped by the wording of their definitions, the group with the first law first. The
 * definitions that refer to the same provision of another law make one group, however they word it
 * (with or without the law number), quoted from a law that names the other law by its title. What a
 * reference adds in parentheses (公益法人等を除く。) changes its meaning, and keeps it apart.
 */
export function definitionGroups(t: Term): { def: Definition; laws: TermLaw[]; source?: TermSource }[] {
  const groups = new Map<string, { def: Definition; laws: TermLaw[]; source?: TermSource }>();
  for (const l of t.laws) {
    const key = l.source ? `\0${l.source.law}\0${l.source.provision}\0${qualifiers(l.def.text)}` : `${l.def.text}\n${(l.def.items ?? []).join("\n")}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { def: l.def, laws: [l], ...(l.source ? { source: l.source } : {}) });
    else {
      g.laws.push(l);
      if (g.def.text.startsWith("同法") && !l.def.text.startsWith("同法")) g.def = l.def;
    }
  }
  return [...groups.values()];
}

/**
 * Other terms defined by the same laws (at least two in common). A term that many laws define is
 * weighed down (laws in common / √its laws), so that terms defined only alongside this one come first.
 */
export function relatedTerms(t: Term, limit: number): string[] {
  const { byLaw, byTerm } = termIndex();
  const shared = new Map<string, number>();
  for (const l of t.laws) for (const other of byLaw.get(l.id) ?? []) if (other !== t.term) shared.set(other, (shared.get(other) ?? 0) + 1);
  const score = (term: string, n: number) => n / Math.sqrt(byTerm.get(term)?.laws.length ?? 1);
  return [...shared]
    .filter(([, n]) => n >= 2)
    .map(([term, n]) => ({ term, s: score(term, n) }))
    .sort((a, b) => b.s - a.s || (a.term < b.term ? -1 : 1))
    .slice(0, limit)
    .map((r) => r.term);
}
