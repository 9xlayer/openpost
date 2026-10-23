import { readFileSync } from "node:fs";
import path from "node:path";

// These are compatibility admissions, not a general advisory suppression.
// GHSA-mrhx-c7xc-m3w5: all Zod 4 consumers must have the patched release.
// Legacy Zod 3 is confined to IMG.LY's local editor configuration and the
// n8n development toolchain. The published n8n node has no runtime dependencies.
// GHSA-pfhg-q3qv-9q6r and GHSA-27mw-82g8-phjj: neither static SvelteKit
// consumer uses enhanced form actions or prerender setHeaders. Reject their
// introduction until Kit is upgraded and these admissions are removed.
try {
  const lock = Bun.JSONC.parse(readFileSync("bun.lock", "utf8"));
  const legacyOwners = new Set([
    "@imgly/background-removal/zod",
    "@n8n/ai-utilities/zod",
    "@n8n/backend-network/zod",
    "@n8n/config/zod",
    "@n8n/expression-runtime/zod",
    "@n8n/permissions/zod",
  ]);
  let zodCount = 0;
  for (const [owner, [identity]] of Object.entries(lock.packages)) {
    if (!identity.startsWith("zod@")) continue;
    zodCount++;
    if (identity === "zod@3.25.76" && legacyOwners.has(owner)) continue;
    const version = identity.slice(4).split(".").map(Number);
    if (
      version.length !== 3 ||
      version.some((part) => !Number.isInteger(part)) ||
      version[0] !== 4 ||
      version[1] < 6 ||
      (version[1] === 6 && version[2] < 6)
    ) {
      throw new Error(`Unreviewed Zod security admission: ${owner} (${identity})`);
    }
  }
  if (!zodCount) throw new Error("No Zod artifacts found in bun.lock");
  for (const directory of ["apps/web/src", "apps/marketing/src", "packages/ui/src"]) {
    const files = Array.from(
      new Bun.Glob("**/*.{js,ts,svelte}").scanSync({
        cwd: directory,
        onlyFiles: true,
      }),
    );
    if (!files.length) throw new Error(`Missing SvelteKit security source boundary: ${directory}`);
    for (const file of files) {
      const sourcePath = path.join(directory, file);
      if (/\$app\/forms|\bsetHeaders\b|use:enhance\b/.test(readFileSync(sourcePath, "utf8"))) {
        throw new Error(`Re-review SvelteKit advisory admissions: ${sourcePath}`);
      }
    }
  }
  console.log("Verified bounded Zod and unused SvelteKit API security admissions");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
