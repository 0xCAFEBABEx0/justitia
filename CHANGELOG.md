# Changelog

All notable changes to [Anisotropics](https://anisotro.pics) (the site, the data published at
`https://data.anisotro.pics`, and its feeds and calendars) are recorded here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and versions are calendar versions `YYYY.M.N`
(see [README, Versioning and releases](README.md#versioning-and-releases)). The daily data updates from houritsu are
not releases and are not listed.

Changes merged since the latest release: [compare](https://github.com/0xCAFEBABEx0/justitia/compare/v2026.11.1...main).

## [2026.11.1] - 2026-11-14

What the site gained since 2026.11.0 (#43 to #65). Changes to the repository settings, CI, infrastructure and agent
instructions are left out.

### Added

- Static amendment pages at `/amendment/<amendment key>/`, each with its own title, description, canonical link and
  structured data, listed in a new `sitemap-amendments-0.xml`. Every link to an amendment (pages, RSS items,
  calendars) now points to them; `/amendment/?k=<amendment key>` forwards to the new address and keeps the
  `#fragment`. (#43, #46)
- Amendment pages get a row of actions like law pages (the amendment graph of the changed laws, share, print) and,
  under each changed law, links to its text after the change, the whole text compared with the revision before, and
  both revisions on e-Gov 法令検索. (#48)
- 法令の統計 (`/stats/`): laws never amended (with a 制定以来改正なし badge on their law pages and a count on the home
  page), the oldest laws, the most amended laws, the longest and shortest laws, laws written in katakana, the most
  cited laws, companies named by law, and the amendments that changed a law the most. (#52, #53, #55, #58)
- 法令用語の定義集 (`/terms/`, `/terms/<term>/`): how each law in force defines the terms that at least 5 laws define,
  quoted and grouped by wording, with links to the articles. Law pages list the terms they define, and the term pages
  are in their own `sitemap-terms-0.xml`. (#56, #59)
- Bills pending in the Diet: law pages head their amendment history with the bills that would amend the law and how
  far each has got, with a 改正案を審議中 badge by the title, and `/bills/` (国会で審議中の法律案) lists every pending
  law bill. The data comes from the 衆議院議案データベース of SmartNews Media Research Institute (MIT), credited on
  the about page. (#60, #61, #65)
- Icons in the calendar and RSS menu and buttons. (#47)
- A site map of every section in the footer of every page. (#63)

### Changed

- The header groups the pages into dropdowns (法令を探す, 改正・施行, 統計) from 768 px wide, and the phone menu lists
  them by group, with a 「メニュー」 label under its button. (#63)
- The data date the pages show (最終更新, データ更新) changes only when houritsu's content does, not on every publish
  run. (#57)
- Search engines are kept to the pages worth indexing: `robots.txt` disallows the pages filled in from a query
  string (`/versions/`, `/search/?`, `/amendment/?`), amendment pages that show no diff get `noindex` and leave the
  amendments sitemap, and that sitemap gets a `lastmod`. (#62)

### Fixed

- The share and calendar menus stay inside the window on narrow screens. (#50)
- "Invalid date" errors in the law sitemap for laws last amended before 1970. (#51)
- An empty band at the top of a highlighted article on law pages. (#54)
- Amendments whose amending law e-Gov does not name show 「改正法令不明」 instead of the law number
  「000000000000000」 on amendment and law pages, in lists and in the feeds. (#64)

## [2026.11.0] - 2026-11-09

The first versioned release. It records what the site gained from its start on 2026-11-06 up to the introduction of
versioning (#1 to #42). Changes to the repository settings, CI, infrastructure and agent instructions are left out.

### Added

- Law pages (`/laws/<law ID>/`) with the current text, a table of contents and the law's amendment history; law
  lists by kana, type and category (`/browse/`); amendments by year of entry into force (`/timeline/`). (#1)
- Amendment pages (`/amendment/?k=<amendment key>`) with the old and new text of every article an amendment
  changed, side by side (新旧対照) or inline. (#1)
- Amendment graph (`/graph/`): one lane per law, with laws changed by the same amending law joined by a line. (#1)
- Versions page (`/versions/`): a law's text at any revision, past or upcoming, and what changed between two
  revisions. (#4)
- Full-text search (`/search/`) over the current law text, with one result per article. (#4)
- Daily publishing to Cloudflare, right after houritsu's daily update; the data the pages fetch is published at
  `https://data.anisotro.pics`. (#5, #18)
- The site name Anisotropics, page metadata for link previews, icons and a sitemap. (#10)
- A disclaimer under the heading of the law, amendment and versions pages, in the footer of every page, and in full
  on the about page. (#13, #14)
- The code license (AGPL-3.0) and the credits for houritsu (CC BY 4.0) and e-Gov 法令検索 (PDL1.0) in the footer and
  on the about page. (#24)
- Newly enacted laws (`/new/`, `/new/<year>/`), also on the top page, with 新規制定 and 段階施行 badges across the
  site. (#25)
- Repealed laws (`/repealed/`, `/repealed/<year>/`), with how each law was repealed and a link to its text just
  before the repeal; repealed law pages show the same, and 廃止された法令 is in the site navigation. (#27, #29, #30)
- 共有 (share) and 印刷 (print) buttons on the law, amendment and versions pages, a print layout, and buttons that
  copy a link to an article or a citation of it. (#31)
- Upcoming amendments (`/upcoming/`), by month with a countdown and filters, and calendars (`.ics`) of enforcement
  days for the whole site, each category and each law at `https://data.anisotro.pics/feeds/`. (#34)
- RSS feeds of amendments promulgated and coming into force, for the whole site, each category and each law, next
  to the calendars; every page links the site-wide feed. A feed keeps up to 200 items of the past year. (#37, #40)
- This changelog, a versioning policy, and a GitHub Release for every version. (#41)

### Changed

- New design with Tailwind CSS and daisyUI, in light and dark themes and one font (Noto Sans JP) served from the
  site itself. (#11)
- Links in law text look like links, and URLs in amendment diffs are linked. (#26)
- Faster pages: law text blocks off screen skip layout, and the search page's index files are served from the
  cache. (#16, #17)
- The data files at `https://data.anisotro.pics` are stored and served Brotli-compressed (`Content-Encoding: br`);
  clients that do not accept Brotli get them uncompressed. (#19, #20)
- Pages are easier for search engines to read: law pages put the amendment history and table of contents before
  the law text in the HTML (the layout is unchanged), pages carry schema.org breadcrumbs and law pages a Legislation
  entry, law pages are in their own sitemap with the date of their latest amendment, and an amendment page sets its
  own description and canonical link (and noindex for an unknown key). (#42)
- **Breaking:** `amendments/<key>.json` no longer has the `sha` field. It held the houritsu commit SHA, which changed
  whenever houritsu rewrote its history. (#39)

### Fixed

- The accessibility issues Lighthouse reported (contrast, labels, target sizes, heading order). (#15)
- Spacing and layout inconsistencies across the site. (#28)

[2026.11.1]: https://github.com/0xCAFEBABEx0/justitia/compare/v2026.11.0...v2026.11.1
[2026.11.0]: https://github.com/0xCAFEBABEx0/justitia/releases/tag/v2026.11.0
