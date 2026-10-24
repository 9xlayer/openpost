import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createWorkspace, registerUser, clickComposerDeliveryAction } from "./helpers";
import {
  fixtureDirectory,
  rasterFixtureFiles,
  uploadImageFixture,
  prepareProductPage,
} from "./product-capture-fixtures";
import script from "../../apps/marketing/launch-film/script.json" with { type: "json" };

// Opt-in capture of real UI states for the launch film in apps/marketing/launch-film.
// One screenshot per typed character lets the film play the typing at any speed.
// Accounts, schedule responses, analytics and inbox are sample fixtures.
test.skip(process.env.OPENPOST_CAPTURE_LAUNCH_FILM !== "1", "Run bun run capture:launch-film.");

const outputDirectory = "tmp/launch-film/capture";
const viewport = { width: 1440, height: 900 };
test.use({
  actionTimeout: 15_000,
  viewport,
  deviceScaleFactor: 2,
  colorScheme: "dark",
  locale: "en-US",
  timezoneId: "Europe/Lisbon",
  serviceWorkers: "block",
  trace: "off",
});
test.setTimeout(300_000);

const launchPost = script.post;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(outputDirectory, `${name}.png`) });
}

test("captures launch film UI states", async ({ page, request }) => {
  await mkdir(join(outputDirectory, "typing"), { recursive: true });
  await mkdir(join(outputDirectory, "scheduled"), { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const auth = await registerUser(request, `launch-film-${randomUUID()}@example.com`);
  const workspace = await createWorkspace(request, auth.token, "Personal");
  const [backgroundMediaID, logoMediaID] = await Promise.all([
    uploadImageFixture(
      request,
      auth.token,
      workspace.id,
      "lisbon-tram.png",
      await readFile(join(fixtureDirectory, rasterFixtureFiles["lisbon-tram"])),
    ),
    uploadImageFixture(
      request,
      auth.token,
      workspace.id,
      "logo.png",
      await readFile(join(fixtureDirectory, rasterFixtureFiles["openpost-logo"])),
    ),
  ]);
  await prepareProductPage({
    page,
    request,
    auth,
    workspace,
    backgroundMediaID,
    logoMediaID,
    scheme: "dark",
    composerAccountIDs: [
      "account-linkedin",
      "account-threads",
      "account-x",
      "account-mastodon",
      "account-bluesky",
    ],
  });
  await page.emulateMedia({
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });

  await page.goto(`/?workspace=${workspace.id}`);
  await expect(page.getByTestId("compose-shell")).toBeVisible();
  await expect(page.getByTestId("composer-account-loading")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await shot(page, "composer-empty");

  const textbox = page.locator("#post-textarea-0");
  await textbox.click();
  for (const [index, character] of [...launchPost].entries()) {
    await page.keyboard.type(character);
    await shot(page, `typing/${String(index).padStart(4, "0")}`);
  }
  await shot(page, "composer-typed");

  await page.locator(":focus").evaluate((element) => (element as HTMLElement).blur());
  await shot(page, "composer-blurred");

  const destinations = page.getByRole("group", { name: "Destinations" }).getByRole("button");
  const labels = await destinations.allInnerTexts();
  for (let index = 1; index < labels.length; index++) {
    await destinations.nth(index).click();
    const card = page.locator(".social-preview[data-platform]").first();
    await expect(card).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, `composer-destination-${index}`);
    const platform = await card.getAttribute("data-platform");
    await card.screenshot({
      path: join(outputDirectory, `preview-${platform}.png`),
    });
  }
  await destinations.first().click();

  await page.route("**/api/v1/publications/*/renditions", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/v1/publications/*/validate", (route) =>
    route.fulfill({ json: { valid: true, issues: [] } }),
  );
  await page.route("**/api/v1/publications/*/schedule", (route) =>
    route.fulfill({
      json: {
        message: "Scheduled!",
        publication_id: "launch-film",
        renditions: [],
      },
    }),
  );
  await clickComposerDeliveryAction(page, "Schedule");
  const dialog = page.getByTestId("schedule-dialog-shell");
  await dialog.getByRole("button", { name: /^Tomorrow / }).click();
  await page.waitForTimeout(400);
  await shot(page, "schedule-dialog");
  await dialog.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByText("Scheduled!", { exact: true })).toBeVisible();
  for (let index = 0; index < 24; index++) {
    await shot(page, `scheduled/${String(index).padStart(3, "0")}`);
  }

  await page.route("**/api/v1/engagement?**", (route) =>
    route.fulfill({
      json: {
        total: 3,
        next_cursor: "",
        sync_states: [],
        items: [
          ["Marta Silva", "martasilva", "Can a workflow wait for my approval?", "bluesky"],
          [
            "Alex Chen",
            "alexbuilds",
            "Release notes to posts is exactly what I needed.",
            "threads",
          ],
          ["Sam Taylor", "samtaylor", "Does it work with self-hosted GitLab too?", "mastodon"],
        ].map(([author_name, author_handle, body, platform], index) => ({
          id: `launch-comment-${index}`,
          workspace_id: workspace.id,
          author_name,
          author_handle,
          body,
          platform,
          social_account_id: `account-${platform}`,
          account_username: "rodrgds",
          author_avatar_url: "",
          author_remote_id: author_handle,
          attachments: [],
          can_reply: true,
          can_like: true,
          can_unlike: false,
          can_delete: false,
          can_hide: false,
          is_ours: false,
          liked: false,
          hidden: false,
          parent_remote_id: "",
          conversation_remote_id: "",
          remote_id: `comment-${index}`,
          rendition_id: `rendition-${index}`,
          publication_id: "published-aug-19",
          publication_title: "We just shipped Workflows in OpenPost.",
          created_at: "2026-08-20T13:00:00Z",
          updated_at: "2026-08-20T13:00:00Z",
          last_seen_at: "2026-08-20T13:00:00Z",
        })),
      },
    }),
  );
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(page.getByRole("img", { name: "Daily views" })).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, "analytics");
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await expect(page.getByText("Can a workflow wait for my approval?")).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, "inbox");
  await page.goto(`/calendar?workspace=${workspace.id}`);
  await expect(page.getByRole("region", { name: "Monthly publishing calendar" })).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, "calendar");

  expect(errors).toEqual([]);
});
