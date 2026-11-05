import { parse } from "yaml";

export interface LawDoc {
  frontmatter: Record<string, unknown>;
  body: string; // text after the frontmatter
}

/** Splits a houritsu law file into its YAML frontmatter and markdown body. */
export function splitLawFile(text: string): LawDoc {
  if (!text.startsWith("---\n")) return { frontmatter: {}, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return { frontmatter: {}, body: text };
  // Dates like 2026-11-02 stay strings; the site only displays them.
  const frontmatter = (parse(text.slice(4, end), { schema: "core" }) ?? {}) as Record<string, unknown>;
  return { frontmatter, body: text.slice(end + 5) };
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}
