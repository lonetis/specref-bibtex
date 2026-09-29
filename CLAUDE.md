# specref-bibtex

Converts the Specref reference database into one BibTeX file and publishes it with a small search/copy page on GitHub Pages, rebuilt daily.

## Tech stack

- TypeScript run directly by Node.js 24+ (native type stripping, no build step for Node code, no runtime dependencies)
- `tsc` (TypeScript 7) only type-checks, plus compiles the page script `site/app.ts` to `dist/app.js`
- Tests: `node:test` + `node:assert`, files `test/*.test.ts`
- Plain HTML/CSS page, no framework
- GitHub Actions + GitHub Pages (artifact deploy, nothing committed back to the repo)

## Structure

```
src/specref.ts    Specref dump types, fetchDump, alias resolution (resolve, collectAliases)
src/bibtex.ts     Specref entry → BibTeX (convert, formatEntry, parseDate, escapeLatex, renderHeader)
src/build.ts      Entry point: fetch → convert → write dist/ (specref.bib, meta.json, static site files)
site/             Page source: index.html, style.css, app.ts (+ its own tsconfig.json with DOM libs)
test/             Unit tests
.github/workflows/pages.yml   Build + deploy on push to main, daily cron, manual dispatch
```

`dist/` is generated and git-ignored. `npm run build` = `node src/build.ts` (wipes and refills `dist/`, copying `site/` minus `.ts`/tsconfig) followed by `tsc -p site`.

## Data source

`GET https://api.specref.org/bibrefs` (no `refs` param) returns the full dump: one JSON object keyed by id, ~27 MB raw, ~3 MB gzipped. It already has aliases, dated versions (`KEY-YYYYMMDD`, with `versionOf`), uppercase aliases for every key, and `rawDate` turned into `date` strings. Every value carries `id`; aliases are `{ id, aliasOf }`.

## Conversion decisions

- Every non-alias entry becomes `@misc` (works in BibTeX and biblatex); dated versions are included as their own entries.
- Keys are Specref ids, sorted with a numeric collator. Ids with characters invalid in BibTeX keys are skipped and logged (none today).
- Aliases → biblatex `ids` field. Aliases differing only by case from what they point to are dropped (Specref auto-generates uppercase ones; BibTeX keys are case-insensitive).
- Field mapping: `authors` → `author` (+ `and others` for `etAl`), `title` → double-braced `title`, `publisher` → `howpublished`, `status` → `note` (W3C codes expanded via `STATUS_LABELS`), `date` → `year` + unbraced `month` macro, `href` → `url`, plus `isbn`/`pages`.
- Author names containing a comma, a standalone `and`, or a `Jr./Sr.` suffix are brace-protected (printed verbatim); plain "First Last" names stay parseable.
- Text fields: whitespace collapsed, a small set of HTML entities decoded, LaTeX specials escaped. Braces become `\textbraceleft{}`/`\textbraceright{}` because BibTeX counts braces even when escaped. URLs are left raw except `{`, `}`, and whitespace.
- The `.bib` starts with `%` comment lines (source, timestamp, attribution). Never put `@` in them: BibTeX would start parsing an entry.
- Validation done so far (TeX Live 2026 in Docker): biber parses all entries (only warnings: an upstream ISBN typo in `IEEE-754*`); every entry containing a LaTeX escape plus a random sample compiles with biblatex/biber + LuaLaTeX, and the ASCII ones with BibTeX `plain` + pdfLaTeX. Typesetting all 70k entries in one document is impractical (biblatex takes hours).
- Known limitation: author-year `.bst` styles like `plainnat` break when more than 26 *cited* entries share a label (e.g. author-less ETSI specs from one year): `natexlab` suffixes run past `z`. That's the style's limit; don't add a `key` field to work around it without a better label source.

## Page (`site/`)

Loads `meta.json` then `specref.bib`, splits entries on `\n@`, and searches lowercased entry text (all terms must match). Ranking: exact key, exact alias (`ids`), key prefix, rest. Shows at most 50 results. The query is mirrored to `?q=` for shareable links. `Meta` is declared in both `src/build.ts` and `site/app.ts`; keep them in sync.

## Workflow notes

- The `keepalive` job re-enables the workflow through the API on scheduled runs, because GitHub disables cron workflows after 60 days without repo activity and deploys create no commits.
- GitHub Pages must be set to "GitHub Actions" as source in the repo settings.

## Licensing

Code is Apache-2.0 (same as Specref's code). Specref data is CC0. `STATUS_LABELS` in `src/bibtex.ts` is adapted from Specref's `docs/js/search.js`, attributed in the code comment and in `NOTICE`. Keep `NOTICE` updated if more Specref code is reused.
