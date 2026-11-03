import { culoriAdapter } from "./culori";
import { colorjsAdapter } from "./colorjs";
import {
  ComparisonMode,
  MappingMethod,
  SAMPLE_SEEDS,
  PRESERVED_TOKEN_NAMES,
  findOutOfGamutTokens,
  generateComparison,
  inSrgbGamut,
  normalizeSeed
} from "./recipe";
import { createThemeCss } from "../helpers/theme-css";

const adapters = [culoriAdapter, colorjsAdapter];
const modes: ComparisonMode[] = ["light", "dark"];
const mappings: MappingMethod[] = ["perceptual", "strict"];
const defaults = Object.fromEntries(PRESERVED_TOKEN_NAMES.map(token => [token, "#ffffff"]));

adapters.forEach(adapter => {
  describe(adapter.name, () => {
    test.each(SAMPLE_SEEDS.map(seed => [seed.label, seed.value]))("round-trips %s within one 8-bit channel step", (_label, value) => {
      const color = adapter.toOklch(value);
      expect(adapter.inGamut(color)).toBe(true);
      const roundTrip = adapter.toHex(color, "perceptual");
      // At gamut boundaries, mapping precision can move a channel by one step.
      for (const index of [1, 3, 5]) {
        expect(Math.abs(parseInt(roundTrip.slice(index, index + 2), 16) - parseInt(value.slice(index, index + 2), 16))).toBeLessThanOrEqual(
          1
        );
      }
      const otherAdapter = adapters.find(item => item !== adapter);
      if (!otherAdapter) throw new Error(`No second color adapter found for ${adapter.name}.`);
      const other = otherAdapter.toOklch(value);
      expect(color.l).toBeCloseTo(other.l, 5);
      expect(color.c).toBeCloseTo(other.c, 5);
      if (color.c > 0.000001) expect(color.h).toBeCloseTo(other.h, 3);
    });

    test("measures known WCAG reference ratios", () => {
      expect(adapter.contrast("#000000", "#ffffff")).toBeCloseTo(21, 8);
      expect(adapter.contrast("#123456", "#123456")).toBeCloseTo(1, 8);
    });

    test("maps an out-of-gamut candidate without mutating it", () => {
      const candidate = { l: 0.7, c: 0.4, h: 150 };
      expect(adapter.inGamut(candidate)).toBe(false);
      for (const mapping of mappings) {
        const hex = adapter.toHex(candidate, mapping);
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
        const mapped = adapter.toOklch(hex);
        expect(adapter.inGamut(mapped)).toBe(true);
        expect(mapped.c).toBeLessThan(candidate.c);
        expect(Math.abs(mapped.l - candidate.l)).toBeLessThan(0.03);
        expect(Math.abs(mapped.h - candidate.h)).toBeLessThan(5);
      }
      expect(candidate).toEqual({ l: 0.7, c: 0.4, h: 150 });
    });

    for (const mode of modes) {
      for (const mapping of mappings) {
        test.each(SAMPLE_SEEDS)(`${mode}, ${mapping}: generates valid results for $label`, ({ value }) => {
          const result = generateComparison(adapter, value, mode, mapping, defaults);
          expect(Object.keys(result.tokens)).toHaveLength(45);
          expect(Object.keys(result.overrides)).toHaveLength(17);
          expect(result.candidateTokens).toHaveLength(8);
          expect(Object.keys(result.tokens).length - Object.keys(result.overrides).length).toBe(28);
          for (const token of result.candidateTokens) {
            expect(result.overrides).toHaveProperty(token);
            expect(PRESERVED_TOKEN_NAMES).not.toContain(token);
          }
          expect(result.candidateTokens).not.toContain("--calcite-color-transparent");
          expect(result.candidateTokens).not.toContain("--calcite-color-brand-underline");
          for (const token of result.mappedTokens) {
            expect(result.candidateTokens).toContain(token);
          }
          const withoutDefaults = generateComparison(adapter, value, mode, mapping);
          expect(withoutDefaults.overrides).toEqual(result.overrides);
          expect(withoutDefaults.candidateTokens).toEqual(result.candidateTokens);
          expect(withoutDefaults.mappedTokens).toEqual(result.mappedTokens);
          for (const token of ["surface-1", "surface-2", "surface-3", "surface-4"]) {
            expect(result.tokens).toHaveProperty(`--calcite-color-${token}`);
          }
          for (const token of ["background", "foreground-1", "foreground-2", "foreground-3", "foreground-current"]) {
            expect(result.tokens).not.toHaveProperty(`--calcite-color-${token}`);
          }
          expect(result.tokens["--calcite-color-brand"]).toBe(result.seed);
          expect(PRESERVED_TOKEN_NAMES).not.toContain("--calcite-color-text-link");
          expect(result.tokens["--calcite-color-text-link"]).toBe(result.tokens["--calcite-color-brand-hover"]);
          expect(result.css).toContain(`--calcite-color-text-link: ${result.tokens["--calcite-color-text-link"]};`);
          expect(result.contrastChecks).toHaveLength(8);
          expect(Object.values(result.source).every(Number.isFinite)).toBe(true);
          expect(result).toEqual(generateComparison(adapter, value, mode, mapping, defaults));
          expect(result.css.startsWith(`:root {\n  color-scheme: ${mode};\n`)).toBe(true);
          expect(result.css).not.toContain("calcite-mode-");
          Object.entries(result.tokens).forEach(([token, hex]) => {
            expect(hex).toMatch(/^(?:#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, (?:0|0?\.\d+)\))$/);
            if (PRESERVED_TOKEN_NAMES.includes(token)) {
              expect(hex).toBe(defaults[token]);
              expect(result.css).not.toContain(`${token}:`);
              expect(result.mappedTokens).not.toContain(token);
            } else {
              expect(result.css).toContain(`${token}: ${hex};`);
            }
          });
          for (const check of result.contrastChecks) {
            const foreground = result.tokens[`--calcite-color-${check.foreground}`];
            const background = result.tokens[`--calcite-color-${check.background}`];
            // The libraries use slightly different sRGB luminance coefficients.
            expect(Math.abs(check.ratio - culoriAdapter.contrast(foreground, background))).toBeLessThan(0.001);
            expect(check.passes).toBe(check.ratio >= check.target);
          }
        });
      }
    }

    test("reports failures rather than claiming arbitrary seeds are accessible", () => {
      const result = generateComparison(adapter, "#ffff00", "light", "perceptual", defaults);
      const brandText = result.contrastChecks.find(check => check.background === "brand");
      if (!brandText) throw new Error("The generated recipe is missing its brand contrast check.");
      expect(brandText.passes).toBe(false);
      expect(brandText.ratio).toBeLessThan(4.5);
    });

    test("neutral seeds have a stable achromatic hue", () => {
      for (const seed of ["#000000", "#808080", "#ffffff"]) {
        expect(generateComparison(adapter, seed, "light", "strict").source).toMatchObject({ c: 0, h: 0 });
      }
    });
  });
});

test("normalizes opaque HEX and rejects unsupported input explicitly", () => {
  expect(normalizeSeed(" #AbC ")).toBe("#aabbcc");
  for (const input of ["", "red", "#12", "#gggggg", "#12345678", "transparent", "oklch(0.5 0.1 30)"]) {
    expect(() => normalizeSeed(input)).toThrow("Enter an opaque HEX color");
  }
});

test("uses one explicit gamut tolerance for both libraries", () => {
  expect(inSrgbGamut([-0.00000001, 0.5, 1.00000001])).toBe(true);
  expect(inSrgbGamut([-0.000001, 0.5, 1])).toBe(false);
  expect(() => inSrgbGamut([NaN, 0, 0])).toThrow("invalid sRGB coordinates");
});

test("flags raw out-of-gamut colors without mapping them", () => {
  const toHex = jest.fn(() => {
    throw new Error("Raw colors must not be mapped.");
  });
  const adapter = {
    ...culoriAdapter,
    toHex,
    toOklch: (value: string) => (value === "outside" ? { l: 0.7, c: 0.4, h: 150 } : culoriAdapter.toOklch(value))
  };
  const outOfGamutTokens = findOutOfGamutTokens(adapter, {
    "--inside": "#007ac2",
    "--outside": "outside"
  });

  expect(outOfGamutTokens).toEqual(["--outside"]);
  expect(toHex).not.toHaveBeenCalled();
});

test.each(modes)("exports %s mode even without token overrides", mode => {
  expect(createThemeCss({}, mode)).toBe(`:root {\n  color-scheme: ${mode};\n}`);
});

test("exports token overrides alongside the selected color scheme", () => {
  expect(createThemeCss({ "--calcite-color-brand": "#007ac2", "--calcite-corner-radius-round": "4px" }, "dark")).toBe(
    ":root {\n  color-scheme: dark;\n  --calcite-color-brand: #007ac2;\n  --calcite-corner-radius-round: 4px;\n}"
  );
});
