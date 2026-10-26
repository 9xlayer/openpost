import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { publicPlan, resolvePlan } from "./tasks.mjs";

test("default tests isolate workspace browser processes from heavier test stages", () => {
  const result = taskPlan("test");
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  const stages = Object.fromEntries(plan.stages.map((stage) => [stage.label, stage]));

  assert.equal(stages["backend tests"].phase, stages["repository tests"].phase);
  assert.ok(stages["workspace tests"].phase > stages["repository tests"].phase);
  assert.match(stages["workspace tests"].commands[0], /--concurrency 1/u);
});

test("verification finishes format and lint before starting tests", () => {
  const result = taskPlan("verify");
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  const stages = Object.fromEntries(plan.stages.map((stage) => [stage.label, stage]));

  assert.equal(stages["format check"].phase, stages.lint.phase);
  assert.ok(stages.tests.phase > stages.lint.phase);
  assert.ok(stages["production builds"].phase > stages.tests.phase);
});

test("public site builds marketing and docs before composing their outputs", () => {
  const result = taskPlan("build", "public-site");
  assert.equal(result.status, 0, result.stderr);
  const stages = Object.fromEntries(
    JSON.parse(result.stdout).stages.map((stage) => [stage.label, stage]),
  );
  assert.equal(stages["marketing build"].phase, stages["documentation build"].phase);
  assert.ok(stages["public site composition"].phase > stages["documentation build"].phase);
});

test("unknown scopes fail with the supported interface", () => {
  const result = taskPlan("test", "unknown");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /supported test scopes/u);
});

function taskPlan(command, scope, environment = {}) {
  const previous = Object.fromEntries(
    Object.keys(environment).map((name) => [name, process.env[name]]),
  );
  try {
    Object.assign(process.env, environment);
    return { status: 0, stdout: JSON.stringify(publicPlan(resolvePlan(command, scope))) };
  } catch (error) {
    return { status: 1, stderr: error.message };
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("checks finish translation readers before policy builds regenerate translations", () => {
  const { stdout } = taskPlan("check");
  const stages = Object.fromEntries(JSON.parse(stdout).stages.map((stage) => [stage.label, stage]));
  assert.ok(stages["repository policy"].phase > stages["frontend types"].phase);
  assert.ok(stages["repository policy"].phase > stages["marketing types"].phase);
});

test("combined frontend and marketing checks compile translations once before both readers", () => {
  const plannedCheck = (scope) =>
    spawnSync("bun", ["scripts/tasks.mjs", "check", scope, "--plan"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    });
  const combined = plannedCheck("frontend-marketing");
  assert.equal(combined.status, 0, combined.stderr);
  const stages = JSON.parse(combined.stdout).stages;
  assert.equal(stages.filter((stage) => stage.label === "frontend translations").length, 1);
  const translations = stages.find((stage) => stage.label === "frontend translations");
  const frontend = stages.find((stage) => stage.label === "frontend types");
  const marketing = stages.find((stage) => stage.label === "marketing types");
  assert.ok(translations.phase < frontend.phase);
  assert.ok(translations.phase < marketing.phase);
  assert.equal(frontend.phase, marketing.phase);

  for (const scope of ["frontend", "marketing"]) {
    const standalone = plannedCheck(scope);
    assert.equal(standalone.status, 0, standalone.stderr);
    assert.equal(
      JSON.parse(standalone.stdout).stages.filter(
        (stage) => stage.label === "frontend translations",
      ).length,
      1,
    );
  }
});

test("fallow audits changed code and reports complexity without scopes", () => {
  const result = taskPlan("fallow");
  assert.equal(result.status, 0, result.stderr);
  const stages = Object.fromEntries(
    JSON.parse(result.stdout).stages.map((stage) => [stage.label, stage]),
  );
  assert.match(
    stages["changed-code audit"].commands[0],
    /bun scripts\/fallow-dead-code-gate.mjs audit/u,
  );
  assert.match(stages["changed-code audit"].commands[0], /--max-crap 400/u);
  assert.match(stages["complexity and hotspots"].commands[0], /--report-only/u);
  assert.match(stages["complexity and hotspots"].commands[0], /--hotspots/u);
  assert.match(stages["complexity and hotspots"].commands[0], /--targets/u);
  assert.match(stages["mobile audit and health"].commands[0], /--root apps\/mobile/u);

  const ciResult = taskPlan("fallow", undefined, { OPENPOST_FALLOW_CI: "1" });
  assert.equal(ciResult.status, 0, ciResult.stderr);
  const ciStages = Object.fromEntries(
    JSON.parse(ciResult.stdout).stages.map((stage) => [stage.label, stage]),
  );
  assert.match(
    ciStages["changed-code audit"].commands[0],
    /bun scripts\/fallow-dead-code-gate.mjs audit/u,
  );
  assert.doesNotMatch(ciStages["complexity and hotspots"].commands[0], /--hotspots|--targets/u);
  assert.match(
    ciStages["complexity and hotspots"].commands[0],
    /--complexity .*--file-scores .*--score/u,
  );
  assert.doesNotMatch(ciStages["mobile audit and health"].commands[1], /--hotspots|--targets/u);
  assert.match(
    ciStages["mobile audit and health"].commands[1],
    /--complexity .*--file-scores .*--score/u,
  );

  const scoped = taskPlan("fallow", "frontend");
  assert.notEqual(scoped.status, 0);
});

test("structural gate rejects unused exports while complexity stays advisory", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "openpost-fallow-gate-"));
  const fallow = fileURLToPath(new URL("../node_modules/.bin/fallow", import.meta.url));
  const adapter = fileURLToPath(new URL("./fallow-dead-code-gate.mjs", import.meta.url));
  try {
    writeFileSync(
      path.join(fixture, "package.json"),
      JSON.stringify({ private: true, type: "module", dependencies: { "is-number": "7.0.0" } }),
    );
    writeFileSync(
      path.join(fixture, ".fallowrc.json"),
      JSON.stringify({ entry: ["main.ts"], rules: { "unused-exports": "warn" } }),
    );
    writeFileSync(path.join(fixture, "main.ts"), "console.log('ready');");
    for (const args of [
      ["init", "--quiet"],
      ["add", "."],
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "--quiet",
        "-m",
        "Initial fixture",
      ],
    ]) {
      const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }
    const unchanged = spawnSync("bun", [adapter, "audit", "--base", "HEAD"], {
      cwd: fixture,
      encoding: "utf8",
      env: { ...process.env, PATH: `${path.dirname(fallow)}:${process.env.PATH}` },
    });
    assert.equal(unchanged.status, 0, unchanged.stdout + unchanged.stderr);
    const unchangedAudit = JSON.parse(
      readFileSync(path.join(fixture, "test-results/fallow/root.json"), "utf8"),
    );
    assert.equal(unchangedAudit.changed_files_count, 0);
    assert.equal(unchangedAudit.summary.dead_code_issues, 0);
    assert.equal(unchangedAudit.dead_code, undefined);
    const decisions = Array.from(
      { length: 40 },
      (_, index) => `if (value === ${index}) return ${index};`,
    ).join("\n");
    writeFileSync(
      path.join(fixture, "main.ts"),
      `import { choose } from './helper'; console.log(choose(2));`,
    );
    const helper = `export function choose(value: number) { ${decisions} return -1; }`;
    writeFileSync(
      path.join(fixture, "helper.ts"),
      `${helper}\nexport function unused() { return 1; }`,
    );
    const previousBase = process.env.OPENPOST_FALLOW_BASE;
    let stages;
    try {
      process.env.OPENPOST_FALLOW_BASE = "HEAD";
      stages = resolvePlan("fallow").phases.flat();
    } finally {
      if (previousBase === undefined) delete process.env.OPENPOST_FALLOW_BASE;
      else process.env.OPENPOST_FALLOW_BASE = previousBase;
    }
    const execute = (label) => {
      const step = stages.find((stage) => stage.label === label).steps[0];
      return step.argv[0] === "bun"
        ? spawnSync("bun", [adapter, ...step.argv.slice(2)], {
            cwd: fixture,
            encoding: "utf8",
            env: { ...process.env, PATH: `${path.dirname(fallow)}:${process.env.PATH}` },
          })
        : spawnSync(fallow, step.argv.slice(2), { cwd: fixture, encoding: "utf8" });
    };
    const unused = execute("changed-code audit");
    assert.equal(unused.status, 1, unused.stdout + unused.stderr);
    assert.match(
      readFileSync(path.join(fixture, "test-results/fallow/root.json"), "utf8"),
      /unused/u,
    );
    writeFileSync(path.join(fixture, "helper.ts"), helper);
    const clean = execute("changed-code audit");
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.match(clean.stdout, /"dead_code_inherited": 1/u);
    const invalidConfig = spawnSync("bun", [adapter, "audit", "--config", "missing.json"], {
      cwd: fixture,
      encoding: "utf8",
      env: { ...process.env, PATH: `${path.dirname(fallow)}:${process.env.PATH}` },
    });
    assert.equal(invalidConfig.status, 2, invalidConfig.stdout + invalidConfig.stderr);
    const complexity = execute("complexity and hotspots");
    assert.equal(complexity.status, 0, complexity.stdout + complexity.stderr);
    assert.match(complexity.stdout, /choose/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("local preflight shares verification stages without a production build phase", () => {
  const result = spawnSync("bun", ["scripts/tasks.mjs", "preflight", "--plan"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const stages = Object.fromEntries(
    JSON.parse(result.stdout).stages.map((stage) => [stage.label, stage]),
  );
  assert.equal(stages["format check"].phase, stages.lint.phase);
  assert.ok(stages.tests.phase > stages.lint.phase);
  assert.ok(stages.tests.phase > stages["static checks"].phase);
  assert.equal(stages["production builds"], undefined);
  for (const label of ["npm packages", "n8n package", "mobile source checks"]) {
    assert.equal(stages[label].phase, stages.lint.phase, label);
    assert.ok(stages[label].phase > stages["static checks"].phase, label);
    assert.ok(stages.tests.phase > stages[label].phase, label);
  }
  assert.ok(stages["npm packages"].commands.includes("bun run check"));
  assert.ok(stages["n8n package"].commands.includes("bun run check"));
  assert.deepEqual(stages["mobile source checks"].commands, ["bun run check:source"]);
});

test("preflight children share the root lock and run independent format and lint processes together", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "openpost-preflight-"));
  try {
    mkdirSync(path.join(fixture, "scripts"));
    mkdirSync(path.join(fixture, "bin"));
    for (const directory of [
      "apps/server",
      "apps/cli",
      "apps/mobile",
      "packages/sdk",
      "packages/cli",
      "packages/n8n-nodes-openpost",
    ])
      mkdirSync(path.join(fixture, directory), { recursive: true });
    for (const script of ["tasks.mjs", "turbo-cache.mjs", "go-test-shards.mjs"]) {
      copyFileSync(new URL(`./${script}`, import.meta.url), path.join(fixture, "scripts", script));
    }
    // Only task orchestration is real in this fixture. Leaf tools record their
    // execution instead of requiring the complete application/toolchain.
    const shim = `#!${process.execPath}
import { appendFileSync, readFileSync } from "node:fs";
import { basename } from "node:path";
const tool = basename(process.argv[1]);
const args = process.argv.slice(2);
if (tool === "bun" && args[0] === "scripts/tasks.mjs") {
  const child = Bun.spawn([${JSON.stringify(process.execPath)}, ...args], { env: process.env, stdout: "inherit", stderr: "inherit" });
  process.exit(await child.exited);
}
const record = (event) => appendFileSync(process.env.EVENTS, JSON.stringify({ tool, args, event, locked: process.env.OPENPOST_ROOT_TASK_LOCKED }) + "\\n");
record("start");
if (args.includes("oxfmt") || args.includes("lint:oxlint")) {
  const partner = args.includes("oxfmt") ? "lint:oxlint" : "oxfmt";
  const deadline = Date.now() + 5_000;
  while (!readFileSync(process.env.EVENTS, "utf8").split("\\n").filter(Boolean).map(JSON.parse).some((entry) => entry.event === "start" && entry.args.includes(partner))) {
    if (Date.now() > deadline) throw new Error("independent format and lint never overlapped");
    await Bun.sleep(10);
  }
}
record("end");
`;
    for (const tool of ["bun", "bunx", "go", "git", "golangci-lint"]) {
      writeFileSync(path.join(fixture, "bin", tool), shim, { mode: 0o755 });
    }
    const eventsPath = path.join(fixture, "events.jsonl");
    const result = spawnSync(process.execPath, ["scripts/tasks.mjs", "preflight"], {
      cwd: fixture,
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${fixture}/bin:${process.env.PATH}`,
        EVENTS: eventsPath,
        OPENPOST_ROOT_TASK_LOCKED: "",
        OPENPOST_TURBO_CACHE_DIR: path.join(fixture, "cache"),
      },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const events = readFileSync(eventsPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(events.length > 0);
    assert.ok(events.every(({ locked }) => locked === "1"));
    const format = events.findIndex(
      ({ args, event }) => args.includes("oxfmt") && event === "start",
    );
    const formatEnd = events.findIndex(
      ({ args, event }) => args.includes("oxfmt") && event === "end",
    );
    const lint = events.findIndex(
      ({ args, event }) => args.includes("lint:oxlint") && event === "start",
    );
    const lintEnd = events.findIndex(
      ({ args, event }) => args.includes("lint:oxlint") && event === "end",
    );
    assert.ok(
      format >= 0 && lint >= 0 && format < lintEnd && lint < formatEnd,
      "format and lint must overlap",
    );
    const tests = events.findIndex(
      ({ tool, args, event }) =>
        tool === "bun" && args.join(" ") === "test ./scripts" && event === "start",
    );
    assert.ok(tests > Math.max(formatEnd, lintEnd));
    for (const artifactCheck of [
      "scripts/check-npm-package-build.mjs",
      "scripts/check-n8n-package-build.mjs",
    ]) {
      const finished = events.findIndex(
        ({ args, event }) => args.includes(artifactCheck) && event === "end",
      );
      assert.ok(finished >= 0 && tests > finished, artifactCheck);
    }
    assert.ok(events.some(({ args }) => args.join(" ") === "test ./scripts"));
    assert.ok(
      events.some(({ args }) => args.slice(0, 5).join(" ") === "turbo run test --concurrency 1"),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("the public-build gate hashes its corpus and canonical build dependencies", () => {
  const result = spawnSync("bunx", ["turbo", "run", "_test:public-build", "--dry=json"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const tasks = new Map(JSON.parse(result.stdout).tasks.map((task) => [task.taskId, task]));
  const gate = tasks.get("//#_test:public-build");
  assert.equal(gate.resolvedTaskDefinition.cache, true);
  for (const input of [
    "tests/build/generate-agent-surfaces.test.mjs",
    "scripts/generate-agent-surfaces.mjs",
    "docs/reference/nix-module.md",
    "scripts/tasks.mjs",
    "scripts/cli-option.mjs",
    "scripts/immutable-frontend-assets.mjs",
  ]) {
    assert.ok(gate.inputs[input], `${input} must invalidate the public-build proof`);
  }
  for (const dependency of ["@openpost/docs#build", "@openpost/site#build"]) {
    assert.ok(gate.dependencies.includes(dependency));
    // The gate's independent rebuilds must receive the same environment as
    // their canonical dependency builds, as well as inherit their hashes.
    for (const name of tasks.get(dependency).resolvedTaskDefinition.env) {
      assert.ok(gate.resolvedTaskDefinition.env.includes(name), name);
    }
  }
});
