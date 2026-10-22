import { describe, expect, test } from "bun:test";

import { BUILTIN_THEME_FAMILIES } from "./builtins";
import { buttonRadius, inputPresentation } from "./presentation";

describe("native theme presentation", () => {
  test.each([
    { recipe: "outlined", sides: 1, bottom: 1 },
    { recipe: "underlined", sides: 0, bottom: 1 },
    { recipe: "filled", sides: 0, bottom: 0 },
  ] as const)(
    "renders the $recipe input border on the intended edges",
    ({ recipe, sides, bottom }) => {
      const manifest = BUILTIN_THEME_FAMILIES.workshop.manifests.light!;
      const presentation = inputPresentation({
        ...manifest,
        components: { ...manifest.components, input: recipe },
      });

      expect(presentation.borderWidth).toBe(sides);
      expect(presentation.borderBottomWidth).toBe(bottom);
    },
  );

  test("uses the pill radius for pill-action theme families", () => {
    for (const id of ["apple", "calcom", "firecrawl", "quizlet", "supabase"] as const) {
      const family = BUILTIN_THEME_FAMILIES[id];
      const manifest = family.manifests.light ?? family.manifests.dark!;

      expect(manifest.components.button).toBe("pill");
      expect(buttonRadius(manifest)).toBe(manifest.shape.full);
    }
  });
});
