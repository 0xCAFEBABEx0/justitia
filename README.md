# justitia

日本の法令とその改正履歴を見られる Web サイトです。法令を Git で管理している
[houritsu](https://github.com/Kohei-Wada/houritsu) リポジトリ（1コミット＝1つの改正法の施行）から生成します。
[bundestag/gesetze](https://bundestag.github.io/gesetze/) のような法令一覧と条文に加えて、
Git の強みである「いつ、どう変わったか」（改正履歴と差分）をサイト上で見せることが目的です。

## 進め方

1. **データ抽出**（このリポジトリの `scripts/extract/`）：houritsu の履歴を読んで JSON に書き出す
2. **サイト本体**：法令一覧・条文ページ・法令ごとの改正タイムライン・改正ごとの差分（条単位の新旧対照）
3. **検索と発展機能**：全文検索、未施行の改正（`upcoming` ブランチ）、「○年○月○日時点の条文」
4. **公開**：GitHub Actions で毎日 houritsu を取り込んで再ビルドし、GitHub Pages に公開

## データ抽出

Node.js 22.18 以上が必要です（TypeScript をビルドせずにそのまま実行します）。

```sh
npm install
npm run fetch-houritsu   # houritsu を ./houritsu に clone（2回目以降は fetch）
npm run extract          # ./data に JSON を書き出す
```

オプション（`--repo`, `--out`, `--main`, `--upcoming`, `--only`）の説明は `scripts/extract/index.ts` の先頭のコメントにあります。
`--only 140AC0000000045` のように法令 ID を渡すと、その法令だけを書き出します（動作確認用）。

### 出力（データ）

型は `scripts/extract/types.ts` にあります。

| ファイル | 内容 |
| --- | --- |
| `meta.json` | 生成日時、元にした houritsu のコミット、件数 |
| `laws.json` | 全法令の一覧（現行・廃止・未施行のみ）。五十音順 |
| `laws/<法令ID>.json` | 法令ごとの情報と改正履歴（古い順、未施行の改正は最後） |
| `amendments/<キー>.json` | 改正（houritsu の1コミット）ごとの情報と、変更された法令ごとの条単位の差分 |
| `timeline/<年>.json` | 施行年ごとの改正一覧（施行日未定は `undetermined.json`） |

### 設計上の決めごと

- **URL・キーにコミット SHA を使わない。** houritsu は v1.0 まで履歴を作り直すことがあるため、
  改正のキーは `<改正法令ID>_<施行日YYYYMMDD | undetermined>` にしています
  （同じ改正法令・同じ施行日のコミットが複数あれば `-2`, `-3` を付けます）。
- **差分は条単位で持つ。** 条文を見出し（編・章・節・条・附則・別表など）ごとのブロックに分け、
  新旧のブロックを見出しの番号で対応づけます（`第一条（目的）` と `第一条（趣旨）` は同じ条として扱います）。
  附則の中の条は附則ごとに区別します。新旧対照表のように「どの条がどう変わったか」を表示するためです。
  変更されたブロックは文字単位の差分（変わらない部分・削除・追加の並び）で持つので、新旧どちらの全文も、
  どこが変わったかもこのデータだけで表示できます。大きなブロック（新旧合わせて 2 万字超、主に別表）は
  行単位の unified diff の hunk で持ちます。
- **日付は施行日。** houritsu は 1970 年より前の日付を 1970-01-02 として記録しているため、
  コミット日時ではなく `Enforced` トレーラーの日付を使います。
- **追加・削除行数は概算。** `git diff --numstat` は全履歴では数分かかるため、
  変更されたブロックだけを比較して数えています（見出しも1行と数えます）。
- **制定と収録開始を区別する。** 法令が初めて現れるコミットのうち、改正法令がその法令自身のものは
  「制定」（`enacted`）、それ以外は houritsu が収録を始めた時点（`coverage_start`）です。
  houritsu の履歴は 2015 年ごろからなので、多くの法令は収録開始から始まります。

## サイト

[Astro](https://astro.build/) の静的サイトです。公開先は Cloudflare（無料枠）を想定しています。

- **サイト本体**（`https://anisotro.pics`）：`dist/` を Workers の静的アセットとして配信します。
  静的アセットへのリクエストは無料・無制限です。ファイル数は約 1 万で、無料枠の上限（2 万）に収まります。
- **改正ごとの JSON**（`https://data.anisotro.pics`）：`data/amendments/` を R2 の公開バケットに置き、
  独自ドメイン経由で Cloudflare のキャッシュを効かせて配信します。改正ページはこれをブラウザで読んで描画します。

```sh
npm run extract          # data/ を作る（上記）
npm run build            # dist/ を作る（法令 9,400 件分の条文ページを含む）
npm run preview          # dist/ と data/ を http://localhost:4321/ で配信して確認
```

| 環境変数 | 意味 | 既定値 |
| --- | --- | --- |
| `JUSTITIA_DATA` | 抽出結果のディレクトリ | `./data` |
| `JUSTITIA_HOURITSU` | houritsu の clone（現行条文を読む） | `./houritsu` |
| `PUBLIC_DATA_BASE` | ブラウザが改正 JSON を取りに行く URL | `/data`（本番は `https://data.anisotro.pics`） |
| `JUSTITIA_ONLY_LAWS` | 条文ページを作る法令 ID をカンマ区切りで限定（動作確認用） | すべて |

### ページ

| URL | 内容 |
| --- | --- |
| `/` | 検索、最近施行された改正、これから施行される改正 |
| `/browse/`, `/browse/kana/<行>/`, `/browse/type/<種別>/`, `/browse/category/<分野>/` | 法令一覧 |
| `/laws/<法令ID>/` | 条文（見出しごとにアンカー）、目次、改正履歴 |
| `/amendment/?k=<改正キー>` | 改正で変わった条の新旧対照（改正後・改正前を並べて表示／インライン表示） |
| `/timeline/`, `/timeline/<年>/` | 施行年ごとの改正一覧 |
