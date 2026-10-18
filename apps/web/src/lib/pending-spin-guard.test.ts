import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

// Review check for issue #374 (pending spinners ignore prefers-reduced-motion):
// every spin animation class outside the shared indicator must carry
// `motion-reduce:animate-none` so continuous spin stops under reduced motion
// while the pending state stays announced via aria-busy / status regions.
// Only the shared ActivityIndicator owner may spin without that guard: it
// uses its own keyframes with a `prefers-reduced-motion: reduce` media query
// instead of the Tailwind animation utility. Test files are exempt: they
// query spin selectors or list animation tokens as assertions.
const webRoot = join(__dirname, '..', '..');
const repoRoot = join(webRoot, '..', '..');
const scannedRoots = [join(webRoot, 'src'), join(repoRoot, 'packages', 'ui', 'src')];
// The shared pending affordance. Do not create a second indicator owner.
const owners = new Set([
	join(repoRoot, 'packages', 'ui', 'src', 'lib', 'components', 'activity-indicator.svelte')
]);
function collectFiles(root: string): string[] {
	const entries = readdirSync(root);
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(root, entry);
		const stat = statSync(path);
		if (stat.isDirectory()) {
			if (entry === 'node_modules' || entry.startsWith('.')) continue;
			files.push(...collectFiles(path));
		} else if (/\.(?:svelte|ts|js|mjs|cjs)$/.test(entry)) files.push(path);
	}
	return files;
}

it('guards every animate-spin outside the shared indicator with motion-reduce:animate-none', () => {
	const offenders: string[] = [];
	for (const root of scannedRoots) {
		for (const file of collectFiles(root)) {
			if (owners.has(file)) continue;
			if (/\.(test|spec)\.[^.]+$/.test(file)) continue;
			const lines = readFileSync(file, 'utf8').split('\n');
			lines.forEach((line, index) => {
				if (line.includes('animate-spin') && !line.includes('motion-reduce:animate-none')) {
					offenders.push(`${relative(repoRoot, file)}:${index + 1}:${line.trim()}`);
				}
			});
		}
	}
	expect(offenders).toEqual([]);
});
