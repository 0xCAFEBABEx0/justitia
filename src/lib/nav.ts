// The site's navigation, shared by the header (one dropdown per group), the phone menu (one section
// per group) and the footer site map (one column per group). Every link is a plain <a href> in the
// built HTML, so search engines follow them whether a menu is open or not.

/** The `nav` keys pages pass to Base.astro; they mark the group (and header button) of the current page. */
export type NavKey = "laws" | "new" | "upcoming" | "repealed" | "timeline" | "graph" | "stats" | "terms" | "search" | "about";

export interface NavItem {
  href: string;
  label: string;
  /** One line under the label in the header dropdown. */
  desc?: string;
}

export interface NavGroup {
  /** Used for element ids (`gnav-<id>`) and CSS anchor names. */
  id: "find" | "change" | "stats" | "about";
  label: string;
  /** The pages of this group: a page whose `nav` key is listed marks this group as current. */
  keys: readonly NavKey[];
  items: readonly NavItem[];
  /** Left out of the header row (the footer and the phone menu still list it). */
  headerless?: boolean;
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "find",
    label: "法令を探す",
    keys: ["laws", "search", "terms"],
    items: [
      { href: "/browse/", label: "法令一覧", desc: "五十音・種別から探す" },
      { href: "/browse/#category", label: "分野別の法令", desc: "民事・刑事・行政などの分野から探す" },
      { href: "/search/", label: "全文検索", desc: "条文に含まれる語句で探す" },
      { href: "/terms/", label: "法令用語の定義集", desc: "法令が定義している用語を引く" },
    ],
  },
  {
    id: "change",
    label: "改正・施行",
    keys: ["timeline", "upcoming", "new", "repealed", "graph"],
    items: [
      { href: "/timeline/", label: "改正の年表", desc: "いつ、どの法令が改正されたか" },
      { href: "/upcoming/", label: "施行予定", desc: "公布済みで、まだ施行されていない改正" },
      { href: "/new/", label: "新しい法令", desc: "新しく制定された法令" },
      { href: "/repealed/", label: "廃止された法令", desc: "効力を失った法令" },
      { href: "/graph/", label: "改正のグラフ", desc: "改正のつながりを図で見る" },
    ],
  },
  {
    id: "stats",
    label: "統計",
    keys: ["stats"],
    items: [
      { href: "/stats/", label: "法令の統計（一覧）" },
      { href: "/stats/unamended/", label: "一度も改正されていない法律" },
      { href: "/stats/oldest/", label: "日本一古い法律" },
      { href: "/stats/most-amended/", label: "改正回数ランキング" },
      { href: "/stats/diff/", label: "差分が大きい法改正" },
      { href: "/stats/length/", label: "法令の文字数ランキング" },
      { href: "/stats/katakana/", label: "カタカナで書かれた法律" },
      { href: "/stats/cited/", label: "被引用数ランキング" },
      { href: "/stats/companies/", label: "会社を名指しする法律" },
    ],
  },
  {
    id: "about",
    label: "このサイトについて",
    keys: ["about"],
    headerless: true,
    items: [
      { href: "/about/", label: "このサイトについて" },
      { href: "/about/#disclaimer", label: "免責事項" },
      { href: "/about/#license", label: "出典とライセンス" },
    ],
  },
];

/** The group a page belongs to, from its `nav` key. */
export function currentGroup(nav: NavKey | undefined): NavGroup | undefined {
  return nav ? NAV_GROUPS.find((g) => g.keys.includes(nav)) : undefined;
}

/** Whether a menu link points at the page at `pathname` (links with a #fragment never do). */
export function isCurrent(href: string, pathname: string): boolean {
  return !href.includes("#") && href === pathname;
}
