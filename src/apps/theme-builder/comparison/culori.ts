import { converter, formatHex, formatRgb, modeLrgb, modeOklab, modeOklch, modeRgb, toGamut, useMode, wcagContrast } from "culori/fn";
import { ColorAdapter, inSrgbGamut } from "./recipe";

useMode(modeRgb);
useMode(modeLrgb);
useMode(modeOklab);
useMode(modeOklch);

const toOklch = converter("oklch");
const toRgb = converter("rgb");
const perceptual = toGamut("rgb", "oklch");
const strict = toGamut("rgb", "oklch", null);

export const formatCalciteDefaultColor = (value: string): string => {
  const color = toRgb(value);
  if (!color) throw new Error(`Culori could not parse ${value} as a CSS color.`);
  if (color.alpha !== undefined && color.alpha < 1) return formatRgb(color);
  const hex = formatHex(color);
  if (!hex) throw new Error(`Culori could not serialize ${value} as HEX.`);
  return hex.toLowerCase();
};

export const culoriAdapter: ColorAdapter = {
  name: "Culori",
  toOklch: hex => {
    const color = toOklch(hex);
    if (!color) throw new Error(`Culori could not parse ${hex}.`);
    if (color.h === undefined && color.c >= 0.000001) throw new Error("Culori returned invalid OKLCH coordinates.");
    return { l: color.l, c: color.c, h: color.h ?? 0 };
  },
  toHex: (color, mapping) => {
    const mapped = (mapping === "strict" ? strict : perceptual)({ mode: "oklch", ...color });
    const hex = formatHex(mapped);
    if (!hex) throw new Error("Culori could not serialize a generated color.");
    return hex.toLowerCase();
  },
  inGamut: color => {
    const { r, g, b } = toRgb({ mode: "oklch", ...color });
    return inSrgbGamut([r, g, b]);
  },
  contrast: wcagContrast
};
