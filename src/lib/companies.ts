// The companies and bodies listed on /stats/companies/: companies set up by a law of their own (特殊会社),
// a few well-known bodies with a law of their own (NHK, 日本銀行) and companies that have no such law but
// are named in laws all the same. Counting is done in stats.ts (scanLaws).

export interface Company {
  /** The name as laws write it, shown on the page. */
  name: string;
  /** The name it is commonly known by, if different, such as NTT. */
  short?: string;
  /** Other names that count as the same entry (the other companies of a group). */
  also?: string[];
  /** The title of the law the company or body was set up by or is governed by (根拠法). */
  law?: string;
}

export const COMPANIES: Company[] = [
  { name: "株式会社商工組合中央金庫", short: "商工中金", law: "株式会社商工組合中央金庫法" },
  { name: "日本電信電話株式会社", short: "NTT", law: "日本電信電話株式会社等に関する法律" },
  { name: "東日本電信電話株式会社", short: "NTT東日本・NTT西日本", also: ["西日本電信電話株式会社"], law: "日本電信電話株式会社等に関する法律" },
  { name: "株式会社日本政策金融公庫", short: "日本公庫", law: "株式会社日本政策金融公庫法" },
  { name: "日本郵便株式会社", law: "日本郵便株式会社法" },
  { name: "日本郵政株式会社", law: "日本郵政株式会社法" },
  { name: "株式会社日本政策投資銀行", short: "DBJ", law: "株式会社日本政策投資銀行法" },
  { name: "株式会社国際協力銀行", short: "JBIC", law: "株式会社国際協力銀行法" },
  { name: "日本放送協会", short: "NHK", law: "放送法" },
  { name: "日本銀行", short: "日銀", law: "日本銀行法" },
  { name: "日本たばこ産業株式会社", short: "JT", law: "日本たばこ産業株式会社法" },
  { name: "放送大学学園", law: "放送大学学園法" },
  { name: "日本中央競馬会", short: "JRA", law: "日本中央競馬会法" },
  { name: "日本赤十字社", law: "日本赤十字社法" },
  { name: "日本貨物鉄道株式会社", short: "JR貨物", law: "旅客鉄道株式会社及び日本貨物鉄道株式会社に関する法律" },
  { name: "北海道旅客鉄道株式会社", short: "JR北海道", law: "旅客鉄道株式会社及び日本貨物鉄道株式会社に関する法律" },
  { name: "四国旅客鉄道株式会社", short: "JR四国", law: "旅客鉄道株式会社及び日本貨物鉄道株式会社に関する法律" },
  {
    name: "東日本高速道路株式会社",
    short: "NEXCOなど高速道路会社6社",
    also: ["中日本高速道路株式会社", "西日本高速道路株式会社", "首都高速道路株式会社", "阪神高速道路株式会社", "本州四国連絡高速道路株式会社"],
    law: "高速道路株式会社法",
  },
  { name: "東京地下鉄株式会社", short: "東京メトロ", law: "東京地下鉄株式会社法" },
  { name: "成田国際空港株式会社", short: "NAA", law: "成田国際空港株式会社法" },
  { name: "新関西国際空港株式会社", law: "関西国際空港及び大阪国際空港の一体的かつ効率的な設置及び管理に関する法律" },
  { name: "中部国際空港株式会社", law: "中部国際空港の設置及び管理に関する法律" },
  { name: "株式会社日本貿易保険", short: "NEXI", law: "貿易保険法" },
  { name: "中小企業投資育成株式会社", law: "中小企業投資育成株式会社法" },
  { name: "中間貯蔵・環境安全事業株式会社", short: "JESCO", law: "中間貯蔵・環境安全事業株式会社法" },
  { name: "輸出入・港湾関連情報処理センター株式会社", law: "電子情報処理組織による輸出入等関連業務の処理等に関する法律" },
  { name: "日本アルコール産業株式会社", law: "日本アルコール産業株式会社法" },
  { name: "沖縄電力株式会社" },
  { name: "東京電力株式会社" },
  { name: "東日本旅客鉄道株式会社", short: "JR東日本" },
  { name: "東海旅客鉄道株式会社", short: "JR東海" },
  { name: "西日本旅客鉄道株式会社", short: "JR西日本" },
  { name: "九州旅客鉄道株式会社", short: "JR九州" },
  { name: "電源開発株式会社", short: "J-POWER" },
  { name: "日本航空株式会社", short: "JAL" },
  { name: "国際電信電話株式会社", short: "KDD" },
  { name: "南満洲鉄道株式会社", short: "満鉄" },
];

/**
 * A matcher for one company over the text of laws. Law titles that contain the name, such as
 * 「日本電信電話株式会社等に関する法律」, are taken out first, so a law that only cites such a title
 * does not count. 日本電信電話株式会社 does not match inside 東日本電信電話株式会社.
 */
export function companyMatcher(company: Company, titles: Iterable<string>): (text: string) => boolean {
  const names = [company.name, ...(company.also ?? [])];
  const strip = [...titles].filter((t) => names.some((n) => t.includes(n))).sort((a, b) => b.length - a.length);
  const re = new RegExp(names.map((n) => `(?<![東西])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).join("|"));
  return (text) => {
    if (!names.some((n) => text.includes(n))) return false;
    let s = text;
    for (const t of strip) if (s.includes(t)) s = s.split(t).join("");
    return re.test(s);
  };
}
