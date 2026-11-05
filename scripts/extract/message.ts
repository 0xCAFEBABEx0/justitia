// Parses a houritsu commit message:
//
//   防災庁設置法 施行
//
//   改正法令: 不明
//   公布日: 2026-07-17
//   施行日: 2026-11-02
//
//   変更された法令:
//   - 防災庁設置法（令和八年法律第六十一号）
//
//   Amendment-Law-Id: 508AC0000000061
//   Enforced: 2026-11-02
//   Bill: 閣法 第221回国会 第13号
//   ...

export interface CommitInfo {
  title: string;
  fields: Record<string, string>; // 改正法令, 公布日, 施行日
  trailers: Record<string, string[]>;
}

const TRAILER = /^([A-Za-z][A-Za-z-]*): (.*)$/;
const FIELD = /^(改正法令|公布日|施行日): (.*)$/;

export function parseMessage(subject: string, body: string): CommitInfo {
  const lines = body.replace(/\s+$/, "").split("\n");
  const trailers: Record<string, string[]> = {};
  // The trailer block is the last paragraph.
  let i = lines.length - 1;
  while (i >= 0 && TRAILER.test(lines[i])) i--;
  if (i < 0 || lines[i].trim() === "") {
    for (const line of lines.slice(i + 1)) {
      const m = TRAILER.exec(line)!;
      (trailers[m[1]] ??= []).push(m[2].trim());
    }
  }
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const m = FIELD.exec(line);
    if (m && !(m[1] in fields)) fields[m[1]] = m[2].trim();
  }
  return { title: subject.replace(/\s*施行$/, ""), fields, trailers };
}

export function first(info: CommitInfo, key: string): string | null {
  return info.trailers[key]?.[0] ?? null;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
