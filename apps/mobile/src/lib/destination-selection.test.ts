import { expect, test } from "bun:test";
import { reconcileDestinationSelection } from "./destination-selection";

const known = [
  { id: "active-a", platform: "x" },
  { id: "active-b", platform: "mastodon" },
];

const renditions = [
  { social_account_id: "active-a", platform: "x" },
  { social_account_id: "gone", platform: "bluesky" },
];

test("an unknown id never survives into selectable", () => {
  const result = reconcileDestinationSelection(["active-a", "gone"], known, renditions);
  expect(result.selectable).toEqual(["active-a"]);
  expect(result.unavailable).toEqual([{ accountId: "gone", platform: "bluesky" }]);
});

test("known ids stay selectable in order without duplicates", () => {
  const result = reconcileDestinationSelection(
    ["active-b", "active-a", "active-a"],
    known,
    renditions,
  );
  expect(result.selectable).toEqual(["active-b", "active-a"]);
  expect(result.unavailable).toEqual([]);
});

test("an unavailable id without a stored rendition keeps an empty platform", () => {
  const result = reconcileDestinationSelection(["active-a", "ghost"], known, renditions);
  expect(result.selectable).toEqual(["active-a"]);
  expect(result.unavailable).toEqual([{ accountId: "ghost", platform: "" }]);
});

test("an empty selection reconciles to empty rows", () => {
  const result = reconcileDestinationSelection([], known, renditions);
  expect(result.selectable).toEqual([]);
  expect(result.unavailable).toEqual([]);
});
