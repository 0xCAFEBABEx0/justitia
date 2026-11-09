import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shardOf, SHARDS } from "./amendment-shards.ts";

test("shardOf follows the era and year of the amending law", () => {
  assert.equal(shardOf("129AC0000000089_18980716").name, "justitia-amendments-1");
  assert.equal(shardOf("426AC0000000042_20160401").name, "justitia-amendments-1");
  assert.equal(shardOf("501AC0000000001_20190601").name, "justitia-amendments-2");
  assert.equal(shardOf("504CO0000000100_undetermined").name, "justitia-amendments-2");
  assert.equal(shardOf("505M60000008001_20230401").name, "justitia-amendments-3");
  assert.equal(shardOf("508AC0000000040_20260401").name, "justitia-amendments-3");
  assert.equal(shardOf("510AC0000000001_20280401").name, "justitia-amendments-3");
});

test("every shard has a Wrangler config and a Terraform route for each prefix", () => {
  const tf = readFileSync(new URL("../infra/terraform/envs/prod/amendments.tf", import.meta.url), "utf8");
  for (const s of SHARDS) {
    const config = readFileSync(new URL(`../wrangler.${s.name}.jsonc`, import.meta.url), "utf8");
    assert.match(config, new RegExp(`"name": "${s.name}"`));
    assert.match(config, new RegExp(`"directory": "./dist-amendments/${s.name}"`));
    for (const p of s.prefixes) {
      assert.match(tf, new RegExp(`"${p}"\\s+= "${s.name}"`), `route for prefix "${p}" in amendments.tf`);
    }
  }
});
