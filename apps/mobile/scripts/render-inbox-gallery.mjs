import sharp from "sharp";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
const input = resolve(process.argv[2] ?? "apps/mobile/artifacts/screenshots");
const output = resolve(process.argv[3] ?? input);
const screens = [
  ["inbox", "Chats"],
  ["chat", "Conversation"],
  ["comments", "Comments"],
  ["comment", "Public reply"],
  ["media", "Media"],
];
await mkdir(output, { recursive: true });
for (const scheme of ["light", "dark"]) {
  const width = 320,
    gap = 24,
    top = 76;
  const metadata = await sharp(resolve(input, `inbox-${scheme}.png`)).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Missing native screenshot dimensions");
  const height = Math.round((metadata.height / metadata.width) * width);
  const canvasWidth = screens.length * (width + gap) + gap;
  const foreground = scheme === "dark" ? "#f6f2ec" : "#2d2721";
  const background = scheme === "dark" ? "#17130f" : "#f6f2ec";
  const labels = `<svg width="${canvasWidth}" height="${top}"><g fill="${foreground}" font-family="Arial,sans-serif"><text x="24" y="22" font-size="14">OpenPost native Inbox · Sample data · iOS 26.2 · ${scheme}</text>${screens.map(([, label], index) => `<text x="${gap + index * (width + gap)}" y="59" font-size="18">${label}</text>`).join("")}</g></svg>`;
  const layers = [{ input: Buffer.from(labels), left: 0, top: 0 }];
  for (const [index, [name]] of screens.entries())
    layers.push({
      input: await sharp(resolve(input, `${name}-${scheme}.png`))
        .resize(width, height)
        .png()
        .toBuffer(),
      left: gap + index * (width + gap),
      top,
    });
  await sharp({
    create: { width: canvasWidth, height: height + top + gap, channels: 4, background },
  })
    .composite(layers)
    .png()
    .toFile(resolve(output, `inbox-gallery-${scheme}.png`));
}
