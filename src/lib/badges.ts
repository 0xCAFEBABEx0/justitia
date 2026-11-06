// daisyUI badge classes for law and amendment states, shared by the Astro pages and the
// browser scripts that render amendment and graph pages.

export type BadgeKind = "repealed" | "upcoming" | "enacted" | "amended" | "coverage_start";

const CLASSES: Record<BadgeKind, string> = {
  repealed: "badge-outline badge-error",
  upcoming: "badge-soft badge-primary",
  enacted: "badge-outline badge-success",
  amended: "badge-outline badge-warning",
  coverage_start: "badge-ghost",
};

export function badgeClass(kind: BadgeKind): string {
  return `badge badge-sm whitespace-nowrap align-middle ${CLASSES[kind]}`;
}
