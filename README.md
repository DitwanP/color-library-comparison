# Color Library Comparison

An independent testing app for comparing Culori and Color.js as color-processing
libraries for Calcite theme palettes. Both adapters run the same experimental
OKLCH recipe for Calcite's semantic color tokens so their generated colors, gamut mapping, and contrast
results can be compared side by side.

This is a library evaluation, not the Calcite theme builder or a production
theme generator. Contrast failures are reported, not automatically corrected,
and passing these checks is not a complete accessibility assessment.

## Run locally

Requirements: Node.js 22.8.0 and npm 10 or later.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Enter an opaque HEX seed (for example
`#007ac2`), select light or dark mode, and compare perceptual or strict gamut
mapping. The sample buttons provide a few repeatable test colors.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local Vite development server. |
| `npm run build` | Type-check and create a production build in `dist/`. |
| `npm test` | Run the focused adapter and recipe test suite. |
| `npm run compare:color-bundles` | Measure the minified and gzip size of the matched library adapters. |

## What is compared

- Culori and Color.js use functional imports and implement the same adapter
  contract: HEX/OKLCH conversion, gamut checks, HEX serialization, and WCAG
  contrast measurement.
- The Calcite defaults column reads colors from the installed Calcite
  Components stylesheet and serializes them as HEX without gamut mapping.
  Alpha colors remain `rgba()`; contrast checks are measured with Culori.
- Perceptual mapping uses each library's CSS-style algorithm, which can differ.
  Strict mapping reduces OKLCH chroma without an intentional perceptual
  clipping allowance.
- Contrast is measured on final 8-bit HEX colors. Alpha color tokens remain CSS
  `rgba()` values. Pass/fail uses each
  library's unrounded ratio. Their luminance coefficients can produce slightly
  different ratios for identical HEX pairs.
- Both adapters use a `1e-7` sRGB gamut-boundary tolerance to ignore conversion
  roundoff. Mapping a boundary color may shift an 8-bit channel by one step.
- The app exports only the selected mode's token overrides and `color-scheme`.

The bundle-size script uses esbuild to compare isolated browser ESM adapter
bundles. Its results are not whole-app or production page-chunk sizes.

## Repository contents

- `src/apps/theme-builder/comparison/` — comparison UI, color-library adapters,
  shared recipe, styles, and tests.
- `src/apps/theme-builder/helpers/theme-css.ts` — CSS exporter used by the
  recipe.
- `src/main.tsx` and `src/styles.css` — standalone Vite entry point and
  application-level styles.
- `scripts/compare-color-libraries.cjs` — repeatable adapter bundle-size check.

No license has been assigned to this repository.
