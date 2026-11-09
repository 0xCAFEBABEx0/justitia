# Changelog

All notable changes to [Anisotropics](https://anisotro.pics) (the site, the data published at
`https://data.anisotro.pics`, and its feeds and calendars) are recorded here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and versions are calendar versions `YYYY.M.N`
(see [README, Versioning and releases](README.md#versioning-and-releases)). The daily data updates from houritsu are
not releases and are not listed.

Changes merged since the latest release: [compare](https://github.com/0xCAFEBABEx0/justitia/compare/v2026.11.0...main).

## [2026.11.0] - 2026-11-09

The first versioned release. It records what the site gained from its start on 2026-11-06 up to the introduction of
versioning (#1 to #41). Changes to the repository settings, CI, infrastructure and agent instructions are left out.

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
- **Breaking:** `amendments/<key>.json` no longer has the `sha` field. It held the houritsu commit SHA, which changed
  whenever houritsu rewrote its history. (#39)

### Fixed

- The accessibility issues Lighthouse reported (contrast, labels, target sizes, heading order). (#15)
- Spacing and layout inconsistencies across the site. (#28)

[2026.11.0]: https://github.com/0xCAFEBABEx0/justitia/releases/tag/v2026.11.0
