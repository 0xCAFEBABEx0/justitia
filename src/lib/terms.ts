// Defined terms (定義語) for the /terms/ pages: the words that laws define for their own use, such as
// 「児童」 or 「事業者」, and how each law defines them. Found in the text of the main provisions
// (本則) at build time by scanLaws in stats.ts.

/** How a law defines a term. */
export type DefinitionForm =
  /** 「児童」とは、満十八歳に満たない者をいう。 */
  | "toha"
  /**
   * 暴力団員による不当な行為の防止等に関する法律第二条第六号に規定する暴力団員（以下「暴力団員」という。）:
   * only a definition by reference to another law, or one in the parentheses (（…をいう。以下「X」という。））.
   * A short name for a phrase of the text (事業を行う者（以下「事業者」という。）) does not define what the
   * term means, and is left out.
   */
  | "ika"
  /** 暴力団員（…第二条第六号に規定する暴力団員をいう。以下同じ。） */
  | "paren"
  /** 次の各号に掲げる用語の意義は、当該各号に定めるところによる。 一 会社 株式会社、…をいう。 */
  | "item";

export interface Definition {
  term: string;
  form: DefinitionForm;
  /** The definition as the law words it, quoted from the text. */
  text: string;
  /**
   * The items of a definition that ends 「次に掲げる者をいう。」, as the law words them (「一 …」). A
   * nested item starts with two spaces for each level (「  イ …」).
   */
  items?: string[];
  /** The key of the block (article) the definition is in, as on the law page (#本則|第二条). */
  block: string;
  /** For a definition by reference to another law, the law and the provision it refers to. */
  source?: DefinitionSource;
}

/** The provision of another law that a definition refers to: 地方自治法第二百五十二条の十九第一項. */
export interface DefinitionSource {
  /** The title of the law, in full (a short name the law defines, such as 通則法, is resolved). */
  law: string;
  /** The provision as the definition words it, without parentheses: 第二百五十二条の十九第一項. */
  provision: string;
}

/** What definitionsIn needs to know besides the text. */
export interface DefinitionContext {
  /** The titles of all laws. */
  lawTitles: ReadonlySet<string>;
  /** The short names of laws that the law defines, with the titles they stand for (通則法 → 独立行政法人通則法). */
  shortNames?: ReadonlyMap<string, string>;
}

const NUMBER = "[〇一二三四五六七八九十百千]+";
/** A law number inside the parentheses after a law's title: （平成十一年法律第百三号。以下「通則法」という。） */
const LAW_NUMBER = new RegExp(`(?:明治|大正|昭和|平成|令和)[元〇一二三四五六七八九十]+年[^（）]{0,30}?第${NUMBER}号`);
/** Terms that shorten the name of a law, an order or a treaty. */
const LAW_NAME = /(?:法|法律|令|規則|省令|府令|条例|条約|協定|規程|規約|告示)$/;
/** Characters a term may have: a term is also a URL path segment. */
const TERM = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・々〆Ａ-Ｚａ-ｚ０-９]{2,30}$/u;
/** The opening words of a bracketless definition in older laws: この法律で、児童とは、… */
const SCOPE = /(?:この(?:法律|政令|省令|府令|勅令|規則|命令|章|節|款|条)(?:において|で)、?)$/;
const MAX_TEXT = 400;

const OPEN = "（";
const CLOSE = "）";

/** The end of the definition that starts at `from`: the index after をいう/をいい at depth 0, or -1. */
function definitionEnd(s: string, from: number): number {
  let depth = 0;
  for (let i = from; i < s.length && i - from <= MAX_TEXT; i++) {
    const c = s[i];
    if (c === OPEN) depth++;
    else if (c === CLOSE) {
      if (depth === 0) return -1;
      depth--;
    } else if (depth === 0) {
      if (c === "。" || c === "\n") return -1;
      if (c === "を" && (s.startsWith("をいう", i) || s.startsWith("をいい", i))) return i + 3;
    }
  }
  return -1;
}

/** The index of the unmatched （ before `to`, or -1. */
function openParen(s: string, to: number): number {
  let depth = 0;
  for (let i = to - 1; i >= 0 && to - i <= MAX_TEXT; i--) {
    const c = s[i];
    if (c === CLOSE) depth++;
    else if (c === OPEN) {
      if (depth === 0) return i;
      depth--;
    } else if (c === "\n") return -1;
  }
  return -1;
}

/**
 * The phrase that ends at `to`: back to a 、 or 。, a bracket or the start of the line, at depth 0. A
 * 、 followed by 又は, 及び and the like does not end it (労働者が組織し、又は加入する労働組合), nor
 * does a 、 between the nouns of an enumeration (土地、建物その他の工作物). Empty when no such start
 * is found within 120 characters.
 */
function phraseBefore(s: string, to: number): string {
  let depth = 0;
  let i = to - 1;
  for (; ; i--) {
    if (i < 0) break;
    if (to - i > 120) return "";
    const c = s[i];
    if (c === CLOSE) depth++;
    else if (c === OPEN) {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && "。「」\n".includes(c)) break;
    else if (depth === 0 && c === "、" && !CONJUNCTION.test(s.slice(i + 1, i + 5)) && !enumerates(s, i, to)) break;
  }
  return s.slice(i + 1, to);
}

/** Words that close an enumeration: 土地、建物その他の工作物, 国、地方公共団体及び事業者. */
const ENUMERATION = /その他|及び|又は|並びに|若しくは/;

/** True when the 、 at `at` separates nouns of an enumeration that the phrase up to `to` closes. */
function enumerates(s: string, at: number, to: number): boolean {
  return /[\p{Script=Han}\p{Script=Katakana}ー々]/u.test(s[at - 1] ?? "") && ENUMERATION.test(s.slice(at + 1, to));
}

/** An item of a glossary article: 「- 三の二 子会社等 次のいずれかに該当する者をいう。」 */
const ITEM_DEFINITION = new RegExp(`^- ${NUMBER}(?:の${NUMBER})* (\\S+) (.+)$`);

/** A definition whose substance is in the numbered items that follow it. */
const LIST = /(?:次|左)(?:に掲げる|の各号|のいずれか)/;
const MAX_ITEMS = 30;

/**
 * The list items (「- 一 …」 lines) at the start of `lines`, indented `base` spaces or more, nested
 * items included: each keeps two spaces for every level below the first (「一 …」, 「  イ …」).
 * Undefined when there are too many to show.
 */
function listItems(lines: string[], base: number): string[] | undefined {
  const items: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = /^( *)- (.*)$/.exec(line);
    if (!m || m[1].length < base) break;
    if (items.length === MAX_ITEMS) return undefined;
    items.push(`${" ".repeat(m[1].length - base)}${stripTags(m[2]).trim()}`);
  }
  return items;
}

/**
 * The numbered items right after the line that ends at `from`, below that line when it is an item
 * itself (「- 一 「X」とは、次に掲げる者をいう。」 takes its 「  - イ」 items, not 「- 二」); none if
 * the line goes on.
 */
function itemsAfter(s: string, from: number): string[] | undefined {
  const eol = s.indexOf("\n", from);
  if (eol < 0 || !/^。?\s*$/.test(s.slice(from, eol))) return undefined;
  const indent = /^( *)- /.exec(s.slice(s.lastIndexOf("\n", from - 1) + 1, eol));
  return listItems(s.slice(eol + 1).split("\n"), indent ? indent[1].length + 2 : 0);
}

const CONJUNCTION = /^(?:又は|及び|並びに|若しくは|かつ)/;

/** True when every （ in the text has its ）. */
function balanced(s: string): boolean {
  let depth = 0;
  for (const c of s) {
    if (c === OPEN) depth++;
    else if (c === CLOSE && --depth < 0) return false;
  }
  return depth === 0;
}

/** The text without markup other than ruby. */
function stripTags(s: string): string {
  return s.replace(/<(?!\/?(?:ruby|rt|rp)\b)[^>]*>/g, "");
}

/**
 * A definition as shown: markup other than ruby (such as the cells of a table) and the marker of a
 * numbered item or paragraph (「- 一 」, 「イ 」, 「２ 」, 「（１） 」) taken out.
 */
function clean(s: string): string {
  return stripTags(s)
    .replace(/^[-\s]*(?:(?:[〇一二三四五六七八九十]+|[０-９0-9]+|[ァ-ヶ]|（[^（）]{1,4}）)\s)?/, "")
    .trim();
}

/** The text without parentheses (and what is in them). */
function withoutParens(s: string): string {
  let out = "";
  let depth = 0;
  for (const c of s) {
    if (c === OPEN) depth++;
    else if (c === CLOSE) depth = Math.max(0, depth - 1);
    else if (depth === 0) out += c;
  }
  return out;
}

/**
 * A provision of a law, then the words that refer to what it defines: 第二条第六号に規定する,
 * 第二百五十二条の十九第一項の. Not 第五条の規定による, which refers to what is done under it
 * (第五条の規定による指定).
 */
const PROVISION = new RegExp(
  `((?:第${NUMBER}条|別表(?:第${NUMBER})?)(?:の${NUMBER})*(?:第${NUMBER}[項号](?:の${NUMBER})*|[イロハニホヘトチリヌルヲワカヨタレソツネナラム]|前段|後段|本文|ただし書)*)(?:に規定する|に掲げる|に定める|の)$`,
);
/** A short name of a law shorter than this (法, 令, 新法) stands for the law itself or a version of it. */
const MIN_SHORT_NAME = 3;

/**
 * The law and provision that a phrase refers to when it names nothing but the term as another law
 * defines it: 「地方自治法（昭和二十二年法律第六十七号）第二百五十二条の十九第一項の指定都市」 for 指定都市.
 * Words before the title of the law are not part of the reference
 * (「当該外国法人の法人税法第二条第十四号に規定する株主等」); `start` is where the title starts.
 * Undefined when the law is not named by its title or a short name the law defines (法第二条 in an
 * order refers to the law it carries out, 同法第二条 to a law named before).
 */
export function referenceOf(phrase: string, term: string, ctx: DefinitionContext): { source: DefinitionSource; start: number } | undefined {
  const plain = withoutParens(phrase);
  if (!plain.endsWith(term)) return undefined;
  const m = PROVISION.exec(plain.slice(0, plain.length - term.length));
  if (!m) return undefined;
  const head = plain.slice(0, m.index);
  const lawAt = (name: string) => (ctx.lawTitles.has(name) ? name : name.length >= MIN_SHORT_NAME ? ctx.shortNames?.get(name) : undefined);
  // The longest title (or short name) that ends right before the provision.
  for (let i = 0; i < head.length - 1; i++) {
    const name = head.slice(i);
    const law = lawAt(name);
    if (!law) continue;
    const start = phrase.lastIndexOf(name);
    if (start < 0) return undefined;
    return { source: { law, provision: m[1] }, start };
  }
  // 地方自治法第二百五十二条の十九第一項の指定都市及び同法第二百五十二条の二十二第一項の中核市: 同法 is
  // the last law named before it in the phrase.
  if (head.endsWith("同法")) {
    for (let end = head.length - 2; end > 1; end--) {
      for (let i = 0; i < end - 1; i++) {
        const law = lawAt(head.slice(i, end));
        if (law) return { source: { law, provision: m[1] }, start: phrase.lastIndexOf("同法") };
      }
    }
  }
  return undefined;
}

/**
 * The short names of laws that the text defines, with the titles they stand for:
 * 独立行政法人通則法（平成十一年法律第百三号。以下「通則法」という。） → 通則法: 独立行政法人通則法.
 */
export function shortLawNames(texts: string[], lawTitles: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const text of texts) {
    for (const m of text.matchAll(SHORT_NAME)) {
      if (!LAW_NAME.test(m[1]) || out.has(m[1])) continue;
      const open = openParen(text, m.index);
      if (open < 0) continue;
      const before = text.slice(Math.max(0, open - 120), open);
      for (let i = 0; i < before.length - 1; i++) {
        if (lawTitles.has(before.slice(i))) {
          out.set(m[1], before.slice(i));
          break;
        }
      }
    }
  }
  return out;
}

/** （以下「X」という。）, （以下この条において「X」という。）, （以下単に「X」という。） */
const SHORT_NAME = /以下(?:[^「」。（）]{0,20}において)?(?:単に)?「([^「」]{1,30})」という/g;

/** The definitions in the text of one block. */
export function definitionsIn(text: string, block: string, ctx?: DefinitionContext): Definition[] {
  const out: Definition[] = [];
  const add = (term: string, form: DefinitionForm, def: string, items?: string[], source?: DefinitionSource) => {
    const t = clean(def);
    // A definition whose substance is in a list (次に掲げる者) means nothing without it.
    if (LIST.test(t) && !items?.length) return;
    if (t.length < 4 || t.length > MAX_TEXT || !balanced(t)) return;
    // 法人税法第二条第四号に規定する外国法人をいう: a definition by reference, whatever its form.
    if (!source && ctx) {
      const ref = referenceOf(t.replace(/をいう$/, ""), term, ctx);
      if (ref?.start === 0) source = ref.source;
    }
    out.push({ term, form, text: t, block, ...(items?.length ? { items } : {}), ...(source ? { source } : {}) });
  };
  // 「X」とは、…をいう / この法律で、X とは、…をいう
  for (const m of text.matchAll(/とは、/g)) {
    const at = m.index;
    let term: string;
    if (text[at - 1] === "」") {
      const open = text.lastIndexOf("「", at - 1);
      if (open < 0) continue;
      term = text.slice(open + 1, at - 1);
    } else {
      const head = text.slice(Math.max(0, at - 60), at);
      const m2 = /([^「」、。（）\s]{2,30})$/.exec(head);
      if (!m2 || !SCOPE.test(head.slice(0, head.length - m2[1].length))) continue;
      term = m2[1];
    }
    if (!TERM.test(term)) continue;
    const start = at + m[0].length;
    const end = definitionEnd(text, start);
    if (end < 0) continue;
    const def = text.slice(start, end).replace(/をいい$/, "をいう");
    let items: string[] | undefined;
    if (LIST.test(def)) {
      // The substance is in the items: without them (too many, or not found) the definition says nothing.
      items = itemsAfter(text, end);
      if (!items?.length) continue;
    }
    add(term, "toha", def, items);
  }
  // …（…をいう。以下「X」という。）, ○○法第二条に規定するX（以下「X」という。）
  for (const m of text.matchAll(SHORT_NAME)) {
    const term = m[1];
    if (!TERM.test(term) || LAW_NAME.test(term)) continue;
    const open = openParen(text, m.index);
    if (open < 0) continue;
    const inner = text.slice(open + 1, m.index).replace(/[。、]$/, "");
    let def: string;
    if (inner.endsWith("をいう")) def = inner;
    else if (LAW_NUMBER.test(inner)) continue; // 独立行政法人通則法（平成十一年法律第百三号。以下「通則法」という。）
    else {
      // Only a definition by reference to another law: 事業を行う者（以下「事業者」という。） and
      // 第三十三条第一項の登録（以下「登録」という。） only give a phrase of the text a short name. In an
      // item of a glossary article (「- 一 更新組合員 この法律の施行の日（以下「施行日」という。）」), the
      // phrase starts after the term the item defines.
      const phrase = clean(phraseBefore(text, open)).replace(/^.*[ 　]/, "");
      const ref = ctx && referenceOf(phrase, term, ctx);
      if (!ref) continue;
      const quoted = phrase.slice(ref.start);
      add(term, "ika", inner ? `${quoted}（${inner}）` : quoted, undefined, ref.source);
      continue;
    }
    add(term, "ika", def);
  }
  // 暴力団員（…をいう。以下同じ。）
  for (const m of text.matchAll(/をいう。以下(?:[^「」。（）]{0,20}において)?同じ。）/g)) {
    const open = openParen(text, m.index);
    if (open < 0) continue;
    const head = text.slice(Math.max(0, open - 40), open);
    const run = /([\p{Script=Han}\p{Script=Katakana}ー・々]{2,30})$/u.exec(head);
    if (!run) continue;
    const before = head.slice(0, head.length - run[1].length);
    if (before && !/(?:[、。」\nはがをにもとで]|及び|又は|並びに|若しくは)$/.test(before)) continue;
    const term = run[1];
    if (!TERM.test(term) || LAW_NAME.test(term)) continue;
    add(term, "paren", text.slice(open + 1, m.index + 3));
  }
  // 次の各号に掲げる用語の意義は、当該各号に定めるところによる。 - 一 会社 株式会社、…をいう。
  const glossary = /用語の意義は、/.exec(text);
  if (glossary) {
    const lines = text.slice(glossary.index).split("\n");
    lines.forEach((line, i) => {
      const m = ITEM_DEFINITION.exec(line);
      if (!m || !TERM.test(m[1]) || LAW_NAME.test(m[1])) return;
      const def = m[2].replace(/。$/, "");
      if (!/をいう$/.test(def)) return;
      let items: string[] | undefined;
      if (LIST.test(def)) {
        items = listItems(lines.slice(i + 1), 2);
        if (!items?.length) return; // too many to show, or none
      }
      add(m[1], "item", def, items);
    });
  }
  return out;
}

/**
 * How strongly a definition states the meaning of the term: とは and glossary items most, then the
 * parenthesized ones, then a reference to another law in （以下「X」という。）, which the caller may
 * still drop (see scanLaws).
 */
function strength(d: Definition): number {
  if (d.form === "toha" || d.form === "item") return 2;
  return d.form === "ika" && d.source ? 0 : 1;
}

/** The definitions in the main provisions of a law, at most one for each term (the first of the strongest; see strength). */
export function lawDefinitions(blocks: { key: string; level: number; text: string }[], lawTitles: ReadonlySet<string> = new Set()): Definition[] {
  const main = blocks.filter((b) => b.level !== 1 && b.key.startsWith("本則|"));
  const ctx: DefinitionContext = { lawTitles, shortNames: shortLawNames(main.map((b) => b.text), lawTitles) };
  const byTerm = new Map<string, Definition>();
  for (const b of main) {
    for (const d of definitionsIn(b.text, b.key, ctx)) {
      const had = byTerm.get(d.term);
      if (!had || strength(d) > strength(had)) byTerm.set(d.term, d);
    }
  }
  return [...byTerm.values()];
}
