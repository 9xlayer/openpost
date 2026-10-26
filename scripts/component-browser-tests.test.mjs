import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runShard(failPreparation = false) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "openpost-component-runner-"));
  try {
    const files = ["first.svelte.test.ts", "second.svelte.test.ts", "plain.svelte.test.ts"];
    for (const file of files) {
      writeFileSync(path.join(directory, file), file === files[2] ? "" : 'vi.mock("dependency");');
    }
    const preload = path.join(directory, "preload.mjs");
    writeFileSync(
      preload,
      `import childProcess from "node:child_process";
       import { syncBuiltinESMExports } from "node:module";
       import { appendFileSync, writeFileSync } from "node:fs";
       childProcess.spawnSync = (executable, args, options) => {
         appendFileSync("calls.jsonl", JSON.stringify({ executable, args, precompiled: options.env?.OPENPOST_PARAGLIDE_PRECOMPILED }) + "\\n");
         if (args.includes("--filesOnly")) {
           writeFileSync(args[args.indexOf("--json") + 1], JSON.stringify(${JSON.stringify(files.map((file) => ({ file: path.join(directory, file) })))}));
         }
         return { status: executable === "bun" && ${failPreparation} ? 1 : 0 };
       };
       syncBuiltinESMExports();`,
    );
    const result = spawnSync(
      "node",
      ["--import", preload, path.resolve("apps/web/scripts/component-browser-tests.mjs"), "1/1"],
      { cwd: directory, encoding: "utf8", timeout: 10000 },
    );
    const calls = readFileSync(path.join(directory, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    return { ...result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("a browser shard generates translations once before inventory and isolated test processes", () => {
  const result = runShard();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls[0].args, ["run", "generate:i18n"]);
  assert.equal(result.calls.filter(({ executable }) => executable === "bun").length, 1);
  const vitest = result.calls.slice(1);
  assert.equal(vitest[0].args[1], "list");
  assert.equal(vitest.filter(({ args }) => args[1] === "run").length, 3);
  for (const call of vitest) assert.equal(call.precompiled, "1");
});

test("failed translation preparation stops the shard before test discovery", () => {
  const result = runShard(true);
  assert.notEqual(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].executable, "bun");
});
