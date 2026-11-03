import React, { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import "@esri/calcite-components/dist/components/calcite-button";
import "@esri/calcite-components/dist/components/calcite-input";
import "@esri/calcite-components/dist/components/calcite-link";
import "@esri/calcite-components/dist/components/calcite-list";
import "@esri/calcite-components/dist/components/calcite-list-item";
import "@esri/calcite-components/dist/components/calcite-option";
import "@esri/calcite-components/dist/components/calcite-select";
import { CalciteButton, CalciteInput, CalciteLink, CalciteList, CalciteListItem, CalciteOption, CalciteSelect } from "@esri/calcite-components-react";
import { culoriAdapter } from "./culori";
import { colorjsAdapter } from "./colorjs";
import {
  ComparisonMode,
  ComparisonResult,
  MappingMethod,
  SAMPLE_SEEDS,
  PRESERVED_TOKEN_NAMES,
  findOutOfGamutTokens,
  generateComparison,
  measureContrastChecks,
  normalizeSeed
} from "./recipe";
import "./comparison.scss";

const adapters = [culoriAdapter, colorjsAdapter];
type TokenStyles = CSSProperties & Record<string, string>;
type DisplayResult = Pick<ComparisonResult, "tokens" | "contrastChecks"> &
  Partial<Pick<ComparisonResult, "source" | "mappedTokens" | "css">> & { outOfGamutTokens?: string[] };

const legacySurfaceTokens: Record<string, string> = {
  "--calcite-color-surface-1": "--calcite-color-background",
  "--calcite-color-surface-2": "--calcite-color-foreground-1",
  "--calcite-color-surface-3": "--calcite-color-foreground-2",
  "--calcite-color-surface-4": "--calcite-color-foreground-3"
};

const readCalciteDefaultTokens = (mode: ComparisonMode, tokenNames: string[]): Record<string, string> => {
  const probe = document.createElement("div");
  probe.classList.add(`calcite-mode-${mode}`);
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);

  try {
    const styles = window.getComputedStyle(probe);
    return Object.fromEntries(
      tokenNames.map(token => {
        const sourceToken = legacySurfaceTokens[token] ?? token;
        const value = styles.getPropertyValue(sourceToken).trim();
        if (!value) throw new Error(`Calcite does not define the default value for ${sourceToken}.`);
        return [token, value];
      })
    );
  } finally {
    probe.remove();
  }
};

const LibraryResult = ({
  name,
  result,
  mode,
  previewSurface
}: {
  name: string;
  result: DisplayResult;
  mode: ComparisonMode;
  previewSurface: string;
}) => (
  <section className="color-comparison-result" aria-label={`${name} results`}>
    <h2>{name}</h2>
    {result.source ? (
      <p>
        Seed OKLCH: {result.source.l.toFixed(5)} / {result.source.c.toFixed(5)} / {result.source.h.toFixed(2)} degrees
        <br />
        {result.mappedTokens?.length ?? 0} of {Object.keys(result.tokens).length} candidates outside sRGB before mapping.
      </p>
    ) : (
      <p>
        {result.outOfGamutTokens?.length ?? 0} of {Object.keys(result.tokens).length} candidates outside sRGB before mapping. Raw Calcite
        defaults are not mapped.
      </p>
    )}
    <div
      className={`color-comparison-preview calcite-mode-${mode}`}
      style={{
        ...result.tokens,
        ...Object.fromEntries(Object.entries(legacySurfaceTokens).map(([surface, legacy]) => [legacy, result.tokens[surface]])),
        "--calcite-color-foreground-current": result.tokens["--calcite-color-surface-highlight"],
        "--calcite-color-background": previewSurface,
        "--calcite-color-surface-1": previewSurface,
        colorScheme: mode
      } as TokenStyles}
    >
      <h3>Component preview</h3>
      <div className="color-comparison-states">
        <CalciteButton type="button" scale="s">Primary</CalciteButton>
        <CalciteButton type="button" appearance="outline" scale="s">Secondary</CalciteButton>
        <CalciteButton type="button" disabled scale="s">Disabled</CalciteButton>
      </div>
      <p>
        <CalciteLink href={`#${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-colors`}>View colors</CalciteLink>
      </p>
      <CalciteList label={`${name} preview layers`} selectionMode="single-persist" scale="s">
        <CalciteListItem label="Parcels" description="Property boundaries" value="parcels" selected />
        <CalciteListItem label="Buildings" description="Building footprints" value="buildings" />
      </CalciteList>
    </div>
    <h3 id={`${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-colors`}>{result.source ? "Output colors" : "Default colors"}</h3>
    <ul className="color-comparison-swatches">
      {Object.entries(result.tokens).sort(([firstToken], [secondToken]) => firstToken.localeCompare(secondToken)).map(([token, value]) => (
        <li key={token}>
          <span aria-hidden="true" style={{ backgroundColor: value }} />
          <code>{token}</code>
          <code>{value}</code>
          {result.mappedTokens?.includes(token) && <small>Gamut mapped</small>}
          {result.outOfGamutTokens?.includes(token) && <small>Outside sRGB, not mapped</small>}
        </li>
      ))}
    </ul>
    <h3>Contrast checks</h3>
    <p>
      {result.source ? "Measured after HEX rounding." : "Measured with Culori from the raw CSS values."} Passing these checks is not a
      full accessibility assessment.
    </p>
    <div className="color-comparison-table">
      <table>
        <caption>{name}: foreground / background</caption>
        <thead>
          <tr>
            <th scope="col">Pair</th>
            <th scope="col">Ratio</th>
            <th scope="col">Target</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {result.contrastChecks.map(check => (
            <tr key={`${check.foreground}-${check.background}`}>
              <th scope="row">
                {check.foreground} / {check.background}
              </th>
              <td title={String(check.ratio)}>{check.ratio.toFixed(2)}:1</td>
              <td>{check.target}:1</td>
              <td>{check.passes ? "Pass" : "Fail"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {result.css && (
      <details>
        <summary>Generated CSS</summary>
        <pre>
          <code>{result.css}</code>
        </pre>
      </details>
    )}
  </section>
);

export const ColorLibraryComparison = () => {
  const [input, setInput] = useState("#007ac2");
  const [seed, setSeed] = useState("#007ac2");
  const [mode, setMode] = useState<ComparisonMode>("light");
  const [mapping, setMapping] = useState<MappingMethod>("perceptual");
  const [error, setError] = useState("");
  const [calciteDefaultTokens, setCalciteDefaultTokens] = useState<Record<string, string> | null>(null);
  const results = useMemo(
    () => adapters.map(adapter => generateComparison(adapter, seed, mode, mapping, calciteDefaultTokens ?? {})),
    [seed, mode, mapping, calciteDefaultTokens]
  );
  const differingTokens = Object.keys(results[0].tokens).filter(token => results[0].tokens[token] !== results[1].tokens[token]);
  const tokenSignature = [...new Set([...PRESERVED_TOKEN_NAMES, ...Object.keys(results[0].tokens)])].join("|");

  useEffect(() => {
    setCalciteDefaultTokens(readCalciteDefaultTokens(mode, tokenSignature.split("|")));
  }, [mode, tokenSignature]);

  const calciteDefaults = useMemo(
    () =>
      calciteDefaultTokens
        ? {
            tokens: calciteDefaultTokens,
            contrastChecks: measureContrastChecks(culoriAdapter, calciteDefaultTokens),
            outOfGamutTokens: findOutOfGamutTokens(culoriAdapter, calciteDefaultTokens)
          }
        : null,
    [calciteDefaultTokens]
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const nextSeed = normalizeSeed(input);
      setInput(nextSeed);
      setSeed(nextSeed);
      setError("");
    } catch (validationError) {
      if (!(validationError instanceof Error)) throw validationError;
      setError(validationError.message);
    }
  };

  return (
    <main className="color-library-comparison">
      <h1>Color library comparison</h1>
      <p>
        Culori and Color.js run the same experimental recipe for Calcite's semantic color tokens. This is a library evaluation, not
        the finished theme generator: contrast failures are reported, not automatically corrected. No changes are applied to the theme
        builder.
      </p>
      <form className="color-comparison-controls" onSubmit={submit}>
        <CalciteInput
          id="comparison-seed"
          label="Palette color (HEX)"
          labelText="Palette color (HEX)"
          value={input}
          status={error ? "invalid" : "idle"}
          validationMessage={error}
          onCalciteInputInput={event => setInput((event.target as HTMLCalciteInputElement).value)}
        />
        <CalciteButton type="submit">Compare color</CalciteButton>
        <CalciteSelect
          id="comparison-mode"
          label="Mode"
          labelText="Mode"
          value={mode}
          onCalciteSelectChange={event => setMode((event.target as HTMLCalciteSelectElement).value === "dark" ? "dark" : "light")}
        >
          <CalciteOption value="light">Light</CalciteOption>
          <CalciteOption value="dark">Dark</CalciteOption>
        </CalciteSelect>
        <CalciteSelect
          id="comparison-mapping"
          label="Gamut mapping"
          labelText="Gamut mapping"
          value={mapping}
          onCalciteSelectChange={event => setMapping((event.target as HTMLCalciteSelectElement).value === "strict" ? "strict" : "perceptual")}
        >
          <CalciteOption value="perceptual">Perceptual (CSS-style)</CalciteOption>
          <CalciteOption value="strict">Strict chroma reduction</CalciteOption>
        </CalciteSelect>
      </form>
      {error && (
        <p id="comparison-error" role="alert">
          The results below still use {seed}.
        </p>
      )}
      <div className="color-comparison-samples" aria-label="Example palette colors">
        {SAMPLE_SEEDS.map(sample => (
          <CalciteButton
            key={sample.value}
            appearance="outline"
            scale="s"
            onClick={() => {
              setInput(sample.value);
              setSeed(sample.value);
              setError("");
            }}
          >
            {sample.label}
          </CalciteButton>
        ))}
      </div>
      <p>
        Perceptual mapping uses each library&apos;s CSS-style implementation; these are not guaranteed to be identical. Strict mapping
        reduces OKLCH chroma with no intentional perceptual clipping allowance.
      </p>
      <p>
        Both adapters use an sRGB boundary tolerance of 0.0000001 to ignore conversion roundoff. The libraries use slightly different
        luminance coefficients, so their unrounded contrast ratios can differ even for identical HEX pairs. Pass/fail uses each
        library&apos;s unrounded result.
      </p>
      <p role="status">
        {seed}, {mode} mode: {differingTokens.length} of {Object.keys(results[0].tokens).length} exported color values differ between libraries.
      </p>
      {differingTokens.length > 0 && (
        <section className="color-comparison-differences" aria-label="Tokens that differ between libraries">
          <h2>Different tokens</h2>
          <div className="color-comparison-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Token</th>
                  {adapters.map(adapter => (
                    <th key={adapter.name} scope="col">
                      {adapter.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {differingTokens.map(token => (
                  <tr key={token}>
                    <th scope="row">
                      <code>{token}</code>
                    </th>
                    {results.map((result, index) => (
                      <td key={adapters[index].name}>
                        <span
                          className="color-comparison-difference-swatch"
                          aria-label={`${adapters[index].name}: ${result.tokens[token]}`}
                          style={{ backgroundColor: result.tokens[token] }}
                        />
                        <code>{result.tokens[token]}</code>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="color-comparison-columns">
        {calciteDefaults ? (
          <LibraryResult
            name="Calcite defaults"
            result={calciteDefaults}
            mode={mode}
            previewSurface={calciteDefaults.tokens["--calcite-color-surface-1"]}
          />
        ) : (
          <section className="color-comparison-result" aria-label="Calcite defaults" aria-busy="true">
            <h2>Calcite defaults</h2>
            <p>Loading default colors…</p>
          </section>
        )}
        {adapters.map((adapter, index) => (
          <LibraryResult
            key={adapter.name}
            name={adapter.name}
            result={results[index]}
            mode={mode}
            previewSurface={calciteDefaults?.tokens["--calcite-color-surface-1"] ?? results[index].tokens["--calcite-color-surface-1"]}
          />
        ))}
      </div>
    </main>
  );
};
