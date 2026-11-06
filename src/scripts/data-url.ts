// URLs of the data files the pages fetch in the browser (amendments/, laws/, history/).
//
// Each page carries the base URL of the data (data-base) and the build's data version (data-v,
// from meta.json). The version goes in the query string, which is part of the data domain's cache
// key, so a page never mixes files cached from an earlier build with files from its own build.

export function dataUrl(root: HTMLElement, path: string): string {
  const v = root.dataset.v;
  return `${root.dataset.base}/${path}${v ? `?v=${encodeURIComponent(v)}` : ""}`;
}
