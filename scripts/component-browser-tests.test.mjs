import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const nodeExecutable = execFileSync("node", ["-p", "process.execPath"], {
  encoding: "utf8",
}).trim();

function runBrowser(args = [], failure = null) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "openpost-component-runner-"));
  try {
    const preload = path.join(directory, "preload.mjs");
    writeFileSync(
      preload,
      `import childProcess from "node:child_process";
       import { syncBuiltinESMExports } from "node:module";
       import { appendFileSync } from "node:fs";
       const failure = ${JSON.stringify(failure)};
       let calls = 0;
       childProcess.spawnSync = (executable, args, options) => {
         appendFileSync("calls.jsonl", JSON.stringify({ executable, args, precompiled: options.env?.OPENPOST_PARAGLIDE_PRECOMPILED }) + "\\n");
         if (++calls === failure?.call) {
           if (failure.kind === "spawn") return { error: new Error("fixture spawn refused"), status: null };
           if (failure.kind === "signal") return { signal: "SIGTERM", status: null };
           return { status: 17 };
         }
         return { status: 0 };
       };
       syncBuiltinESMExports();`,
    );
    const result = spawnSync(
      nodeExecutable,
      ["--import", preload, path.resolve("apps/web/scripts/component-browser-tests.mjs"), ...args],
      { cwd: directory, encoding: "utf8", timeout: 10000 },
    );
    let calls = [];
    try {
      calls = readFileSync(path.join(directory, "calls.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return { ...result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function assertBrowserCall(call, shard) {
  assert.equal(call.executable, nodeExecutable);
  assert.equal(path.basename(call.args[0]), "vitest.mjs");
  assert.deepEqual(call.args.slice(1), [
    "run",
    "--project",
    "client",
    `--shard=${shard}`,
    "--isolate",
    "--maxWorkers=1",
  ]);
  assert.equal(call.precompiled, "1");
}

test("default browser checks prepare translations once and run four native shards sequentially", () => {
  const result = runBrowser();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 5);
  assert.equal(result.calls[0].executable, "bun");
  assert.deepEqual(result.calls[0].args, ["run", "generate:i18n"]);
  for (const [index, shard] of ["1/4", "2/4", "3/4", "4/4"].entries()) {
    assertBrowserCall(result.calls[index + 1], shard);
  }
});

test("an explicit CI shard is propagated exactly after one preparation", () => {
  const result = runBrowser(["3/7"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 2);
  assert.equal(result.calls[0].executable, "bun");
  assert.deepEqual(result.calls[0].args, ["run", "generate:i18n"]);
  assertBrowserCall(result.calls[1], "3/7");
});

test("failed translation preparation stops before any browser shard", () => {
  const result = runBrowser([], { call: 1, kind: "status" });
  assert.notEqual(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].executable, "bun");
  assert.match(result.stderr, /status 17/);
});

for (const [kind, diagnostic] of [
  ["status", /status 17/],
  ["signal", /SIGTERM/],
  ["spawn", /fixture spawn refused/],
]) {
  test(`a browser ${kind} failure stops before later shards`, () => {
    const result = runBrowser([], { call: 3, kind });
    assert.notEqual(result.status, 0, result.stderr);
    assert.equal(result.calls.length, 3);
    assertBrowserCall(result.calls[1], "1/4");
    assertBrowserCall(result.calls[2], "2/4");
    assert.match(result.stderr, diagnostic);
  });
}

test("invalid or extra shard arguments fail before preparation", () => {
  for (const args of [["0/4"], ["5/4"], ["not-a-shard"], ["1/4", "2/4"]]) {
    const result = runBrowser(args);
    assert.notEqual(result.status, 0, result.stderr);
    assert.deepEqual(result.calls, []);
  }
});
