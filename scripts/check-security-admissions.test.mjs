import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./check-security-admissions.mjs", import.meta.url));

test("security admission rejects vulnerable Zod and newly reachable SvelteKit APIs", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "openpost-security-admissions-"));
  const source = path.join(fixture, "apps/web/src/page.svelte");
  const writeLock = (identity, owner = "zod") =>
    writeFileSync(
      path.join(fixture, "bun.lock"),
      JSON.stringify({ packages: { [owner]: [identity] } }),
    );
  const run = () => {
    const child = spawnSync(process.execPath, [script], {
      cwd: fixture,
      encoding: "utf8",
    });
    return { code: child.status, stderr: child.stderr };
  };
  try {
    for (const directory of ["apps/web/src", "apps/marketing/src", "packages/ui/src"]) {
      mkdirSync(path.join(fixture, directory), { recursive: true });
      writeFileSync(path.join(fixture, directory, "page.svelte"), "<p>Static page</p>");
    }
    writeLock("zod@4.6.7");
    expect(run().code).toBe(0);
    for (const identity of ["zod@4.6.5", "zod@4.4.3", "zod@3.25.76"]) {
      writeLock(identity);
      const rejected = run();
      expect(rejected.code).toBe(1);
    }
    writeLock("zod@3.25.76", "@imgly/background-removal/zod");
    expect(run().code).toBe(0);
    for (const api of ["import { enhance } from '$app/forms'", "setHeaders({})", "use:enhance"]) {
      writeFileSync(source, api);
      const rejected = run();
      expect(rejected.code).toBe(1);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
