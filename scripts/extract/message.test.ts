import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMessage } from "./message.ts";

test("parseMessage reads fields and trailers", () => {
  const body = `防災庁設置法 施行

改正法令: 不明
公布日: 2026-07-17
施行日: 2026-11-02

変更された法令:
- 防災庁設置法（令和八年法律第六十一号）

Amendment-Law-Id: 508AC0000000061
Enforced: 2026-11-02
Bill: 閣法 第221回国会 第13号
Bill-Submitter: 内閣
`;
  const info = parseMessage("防災庁設置法 施行", body);
  assert.equal(info.title, "防災庁設置法");
  assert.equal(info.fields["公布日"], "2026-07-17");
  assert.equal(info.fields["施行日"], "2026-11-02");
  assert.deepEqual(info.trailers["Amendment-Law-Id"], ["508AC0000000061"]);
  assert.deepEqual(info.trailers["Bill-Submitter"], ["内閣"]);
});
