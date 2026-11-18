import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SHARD_BYTES, planShards, SHARD_BYTES, splitAt, splitFresh, type IndexedLaw } from "./search-shards.ts";

const law = (id: string, mb: number, hash = id): IndexedLaw => ({ id, bytes: mb * 1_000_000, hash });
const laws = [law("a", 20), law("b", 20), law("c", 20), law("d", 20), law("e", 10)];

test("splitFresh fills shards up to SHARD_BYTES in ID order", () => {
  assert.equal(SHARD_BYTES, 45_000_000);
  assert.deepEqual(splitFresh(laws), [["a", "b"], ["c", "d"], ["e"]]);
  assert.deepEqual(splitFresh([law("a", 50), law("b", 1)]), [["a"], ["b"]]); // an oversized law gets a shard of its own
});

test("splitAt keeps the given first IDs, with new laws in the shard whose range holds them", () => {
  assert.deepEqual(splitAt([law("0", 1), ...laws, law("cc", 1)].sort((x, y) => (x.id < y.id ? -1 : 1)), ["a", "c", "e"]), [["0", "a", "b"], ["c", "cc", "d"], ["e"]]);
  // A shard over the limit, or an empty one, means splitting again.
  assert.equal(splitAt([law("a", MAX_SHARD_BYTES / 1_000_000 + 1), law("c", 1)], ["a", "c"]), null);
  assert.equal(splitAt(laws, ["a", "b0", "b1"]), null);
  assert.equal(splitAt(laws, []), null);
});

test("planShards reuses the shards whose laws did not change", () => {
  const first = planShards(laws, "v1", null);
  assert.deepEqual(first.shards, [["a", "b"], ["c", "d"], ["e"]]);
  assert.deepEqual(first.starts, ["a", "c", "e"]);
  assert.deepEqual(first.reuse, [-1, -1, -1]);

  // Law c changed and grew: the split stays, and only its shard is indexed again.
  const changed = [law("a", 20), law("b", 20), law("c", 25, "c2"), law("d", 20), law("e", 10)];
  const second = planShards(changed, "v1", { starts: first.starts, inputs: first.inputs });
  assert.deepEqual(second.shards, first.shards);
  assert.deepEqual(second.reuse, [0, -1, 2]);
  assert.notEqual(second.input, first.input);

  // Nothing changed: every shard is reused and the input hash is the same, so --skip-if-same skips the run.
  const same = planShards(laws, "v1", { starts: first.starts, inputs: first.inputs });
  assert.deepEqual(same.reuse, [0, 1, 2]);
  assert.equal(same.input, first.input);

  // A change to the indexer (common) indexes everything again.
  assert.deepEqual(planShards(laws, "v2", { starts: first.starts, inputs: first.inputs }).reuse, [-1, -1, -1]);
  // A previous shard that is missing (its hash blanked by readPrevious) is indexed again.
  assert.deepEqual(planShards(laws, "v1", { starts: first.starts, inputs: [first.inputs[0], "", first.inputs[2]] }).reuse, [0, -1, 2]);
});

test("planShards splits from scratch when a kept shard would grow too large", () => {
  const first = planShards(laws, "v1", null);
  const grown = [law("a", 20), law("b", 45), law("c", 20), law("d", 20), law("e", 10)];
  const plan = planShards(grown, "v1", { starts: first.starts, inputs: first.inputs });
  assert.deepEqual(plan.shards, [["a"], ["b"], ["c", "d"], ["e"]]);
  // Shards with the same laws as before are still found by their input hash.
  assert.deepEqual(plan.reuse, [-1, -1, 1, 2]);
});

test("planShards with maxShards keeps only the first shards and says so in the input hash", () => {
  const plan = planShards(laws, "v1", null, 2);
  assert.deepEqual(plan.shards, [["a", "b"], ["c", "d"]]);
  assert.notEqual(plan.input, planShards(laws.slice(0, 4), "v1", null).input);
});
