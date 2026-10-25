import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverGoTests,
  parseShard,
  runPattern,
  shardTests,
  testNamesInSource,
} from "./go-test-shards.mjs";

test("every backend test runs in exactly one shard", () => {
  const names = discoverGoTests("apps/server");
  for (const count of [1, 4, 7]) {
    const shards = Array.from({ length: count }, (_, index) =>
      shardTests(names, { index: index + 1, count }),
    );
    assert.deepEqual(shards.flat().sort(), names, `${count} shards must cover every test once`);
    for (const shard of shards) assert.ok(shard.length > 0, "no shard may run empty");
  }
});

test("shard patterns select whole top-level test names only", () => {
  const pattern = new RegExp(runPattern(["TestSaves", "TestSavesDraft"]));
  assert.ok(pattern.test("TestSaves"));
  assert.ok(pattern.test("TestSavesDraft"));
  assert.ok(!pattern.test("TestSavesDraftTwice"));
  assert.ok(!pattern.test("XTestSaves"));
});

test("test discovery ignores TestMain, helpers, and methods", () => {
  const source = [
    "func TestMain(m *testing.M) {}",
    "func TestCreates(t *testing.T) {}",
    "func (s *suite) TestMethod() {}",
    "func helperTest(t *testing.T) {}",
    "  func TestIndented(t *testing.T) {}",
  ].join("\n");
  assert.deepEqual(testNamesInSource(source), ["TestCreates"]);
});

test("shard selectors reject malformed or out-of-range values", () => {
  assert.deepEqual(parseShard("2/4"), { index: 2, count: 4 });
  for (const value of ["0/4", "5/4", "2", "a/b", undefined]) {
    assert.throws(() => parseShard(value));
  }
});
