// Shapes of the JSON files written by the extractor. The site reads these.
//
// Layout of the output directory:
//   meta.json                 Meta
//   laws.json                 LawSummary[]  (every law ever seen, current and repealed)
//   laws/<lawId>.json         LawDetail
//   amendments/<key>.json     Amendment     (one per houritsu commit)
//   timeline/<year>.json      AmendmentSummary[]  (by enforcement year; "undetermined" for 未定)
//
// Commit SHAs in houritsu are not stable before its v1.0, so nothing here is keyed by SHA.
// An amendment's key is `<Amendment-Law-Id>_<YYYYMMDD | undetermined>`, with `-2`, `-3`, ...
// appended when one amending law has several commits on the same enforcement day.

export type Branch = "main" | "upcoming";

export interface Meta {
  generatedAt: string;
  source: {
    repository: string;
    mainRef: string;
    mainCommit: string;
    upcomingRef: string | null;
    upcomingCommit: string | null;
  };
  counts: {
    laws: number;
    lawsInForce: number;
    lawsRepealed: number;
    amendments: number;
    upcomingAmendments: number;
  };
}

export interface LawSummary {
  id: string; // e-Gov law ID, e.g. "140AC0000000045"
  num: string; // 法令番号, e.g. "明治四十年法律第四十五号"
  title: string;
  kana: string | null;
  abbrev: string | null;
  type: string; // law_type from the frontmatter, e.g. "Act"
  dir: string; // directory under laws/, e.g. "act"
  category: string | null;
  path: string; // path in houritsu at the last revision seen
  status: "in_force" | "repealed" | "upcoming_only";
  /** Enforcement date (YYYY-MM-DD) of the first revision houritsu has. */
  firstRevision: string | null;
  /** Enforcement date of the latest revision in force. */
  lastAmended: string | null;
  revisionCount: number;
  upcomingCount: number;
}

export type FileChangeKind =
  | "enacted" // the law first appears and the amending law is the law itself (制定)
  | "coverage_start" // the law first appears in houritsu through some other revision (収録開始)
  | "amended"
  | "repealed";

export interface LawRevision {
  amendment: string; // Amendment key
  branch: Branch;
  enforced: string | null; // YYYY-MM-DD, null when undetermined
  enforcedText: string | null; // 施行日 line from the commit, e.g. "未定（...）"
  amendmentLawId: string;
  amendmentLawNum: string; // e.g. "令和七年法律第三十九号"
  amendmentTitle: string;
  kind: FileChangeKind;
  revisionId: string | null; // e-Gov revision_id after this change
  additions: number;
  deletions: number;
  /** Headings of the changed blocks (articles etc.), in document order, at most CHANGED_LIMIT. */
  changed: { op: BlockOp; heading: string }[];
  changedCount: number;
  titleChange?: { from: string; to: string };
}

export interface LawDetail extends LawSummary {
  frontmatter: Record<string, unknown>;
  /** Oldest first. Upcoming revisions come after the ones in force. */
  revisions: LawRevision[];
}

export type BlockOp = "added" | "deleted" | "modified";

/**
 * One changed block. A block is a heading (章, 条, 附則, 別表 ...) and the text up to the next
 * heading. Blocks are matched between the old and the new text by heading (without the
 * caption in （）), scoped to 本則 or to each 附則, so an article that only moved or got a
 * new caption is still matched.
 */
export interface BlockChange {
  op: BlockOp;
  key: string;
  level: number; // markdown heading level, 0 for text before the first heading
  heading: string; // heading text after the change (before it, for "deleted")
  oldHeading?: string; // when the heading text itself changed
  /** Enclosing headings, outermost first, e.g. ["第一編　総則", "第一章　通則"]. */
  context: string[];
  /** Full text of the block before / after. Omitted when the block is large (see hunks). */
  old?: string;
  new?: string;
  /** Unified-diff hunks, used instead of old/new when the block is larger than the limit. */
  hunks?: Hunk[];
}

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[]; // each starts with " ", "-" or "+"
}

export interface FileChange {
  lawId: string;
  path: string;
  oldPath?: string;
  kind: FileChangeKind;
  title: string;
  lawNum: string;
  additions: number;
  deletions: number;
  titleChange?: { from: string; to: string };
  /** Present for "amended". For enacted / coverage_start / repealed the full text is in houritsu. */
  blocks?: BlockChange[];
}

export interface Amendment {
  key: string;
  sha: string; // for linking to GitHub only; not stable before houritsu v1.0
  branch: Branch;
  amendmentLawId: string;
  amendmentLawNum: string;
  title: string; // commit subject without the trailing " 施行"
  enforced: string | null;
  enforcedText: string | null;
  promulgated: string | null;
  bill?: { name: string; submitter: string | null; url: string | null };
  skippedRevisions: string[];
  files: FileChange[];
}

export interface AmendmentSummary {
  key: string;
  branch: Branch;
  amendmentLawNum: string;
  title: string;
  enforced: string | null;
  promulgated: string | null;
  laws: { id: string; title: string; kind: FileChangeKind }[];
  additions: number;
  deletions: number;
}
