// daisyUI badge classes for law and amendment states, shared by the Astro pages and the
// browser scripts that render amendment and graph pages.

export type BadgeKind = "repealed" | "upcoming" | "enacted" | "amended" | "coverage_start" | "staged" | "unamended" | "pending";

const CLASSES: Record<BadgeKind, string> = {
  repealed: "badge-outline badge-error",
  upcoming: "badge-soft badge-primary",
  enacted: "badge-outline badge-success",
  amended: "badge-outline badge-warning",
  coverage_start: "badge-ghost",
  // A later part of a newly enacted law coming into force (see isStaged in src/lib/new-laws.ts).
  staged: "badge-soft badge-success",
  // Never amended since the law was made, according to e-Gov (see isUnamended in src/lib/stats.ts).
  unamended: "badge-outline",
  // A bill to amend the law is in the Diet (src/lib/bills.ts): dashed, as it is not law yet.
  pending: "badge-dash badge-secondary",
};

export function badgeClass(kind: BadgeKind): string {
  return `badge badge-sm whitespace-nowrap align-middle ${CLASSES[kind]}`;
}
