// The law number of an amending law, as the site shows it. Shared by the Astro pages, the feeds and the browser
// scripts that render the amendment and graph pages.

/**
 * houritsu records a revision whose amending law e-Gov does not name with the law ID 000000000000000 (its commit
 * says 「改正法令: 不明」) and that ID as the law number. The site shows 「改正法令不明」 instead of the zeros.
 */
export const UNKNOWN_AMENDING_LAW = "改正法令不明";

/** Whether the amending law ID or number is houritsu's placeholder for an unknown amending law. */
export function isUnknownAmendingLaw(idOrNum: string): boolean {
  return /^0+$/.test(idOrNum);
}

/** The amending law's number for display: 「改正法令不明」 for houritsu's placeholder, else the number itself. */
export function amendingLawNum(num: string): string {
  return isUnknownAmendingLaw(num) ? UNKNOWN_AMENDING_LAW : num;
}
