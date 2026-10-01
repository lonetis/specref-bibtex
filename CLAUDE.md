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
src/bibtex.ts     Specref entry → BibTeX (convert, formatEntry, parseDate, renderHeader)
src/latex.ts      Unicode text → LaTeX-safe text (escapeLatex, escapeName)
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
- Keys are Specref ids, sorted with a numeric collator. Ids that are not printable ASCII or contain characters invalid in BibTeX keys are skipped and logged (none today).
- Aliases → biblatex `ids` field. Aliases differing only by case from what they point to are dropped (Specref auto-generates uppercase ones; BibTeX keys are case-insensitive).
- Field mapping: `authors` → `author` (+ `and others` for `etAl`), `title` → double-braced `title`, `publisher` → `howpublished`, `status` → `note` (W3C codes expanded via `STATUS_LABELS`), `date` → `year` + unbraced `month` macro, `href` → `url`, plus `isbn`/`pages`.
- Author names containing a comma, a standalone `and`, or a `Jr./Sr.` suffix are brace-protected (printed verbatim); plain "First Last" names stay parseable.
- Target: every entry compiles as-is with pdfLaTeX (default OT1 font encoding, no packages, no `\DeclareUnicodeCharacter`), LuaLaTeX/XeLaTeX, BibTeX and biber. So the output is UTF-8, but only with characters all of these handle; everything else becomes a command, a simpler character, or is dropped.
- `NATIVE` in `src/latex.ts` lists the non-ASCII characters that stay UTF-8: those pdfLaTeX's built-in UTF-8 support accepts in OT1 *and* Latin Modern (LuaLaTeX's default font) has glyphs for. It was measured with TeX Live 2026 by compiling each character of the Latin, Greek, Cyrillic, punctuation, currency, letterlike, arrow and math blocks on its own (pdfLaTeX errors and LuaLaTeX "Missing character" warnings). Only NFC forms are listed (text is NFC-normalized first). Notable gaps: ą/ę (ogonek), « », đ, ð, þ, ŋ (all T1-only), Vietnamese letters like ạ, Greek, ≠, and ⟨ ⟩, ‒, ― (no glyph in Latin Modern).
- Text fields (`escapeLatex`): HTML entities decoded, then processed per NFC cluster (base character + combining marks): `NATIVE` → kept; `REPLACEMENTS` → mapped (« » → “ ”, ⟨ ⟩ → < >, đ → d, Ω/≠/π → `{\ensuremath{…}}`, μ → µ, U+FFFD → `?`); a letter with marks → as many marks as still give a `NATIVE` letter (ą → a, ễ → ê; dropped marks are reported); ASCII → LaTeX specials escaped (braces as `{\textbraceleft}`/`{\textbraceright}` because BibTeX counts braces even when escaped); otherwise the NFKD compatibility decomposition (𝒪 → O, ？ → ?).
- Accent commands can't replace non-native letters: biber decodes `{\d{a}}` back to UTF-8 ạ in the `.bbl`, which pdfLaTeX rejects. Commands are only safe for characters biber leaves alone (`\ensuremath{…}`) or decodes into `NATIVE` ones.
- Author names (`escapeName`): additionally, a non-ASCII letter that starts a word (after whitespace, `-` or `~`) is written as a braced command: `{\"{U}}mit Yalçinalp`, `Tantek {\c{C}}elik`, `{\L}ukasz`. Classic BibTeX reads names byte by byte and uses the case of a word's first letter to tell given names from particles ("von") and to abbreviate; with a raw `Ü` it treats "Ümit" as a particle. Braced, BibTeX handles the command as one letter, and biber decodes it back to `NATIVE` UTF-8.
- Commands are written in the braced BibTeX "special character" form (`{\"{U}}`, `{\L}`, `{\textbackslash}`): BibTeX then treats each as one letter when sorting, abbreviating and changing case. With the `\textbackslash{}` form, biber writes unbalanced braces into the `.bbl` when a name part starts with the command.
- Whitespace collapses to one space. Default-ignorable characters (zero-width spaces and joiners, soft hyphens, fillers like U+3164 in `webauthn-3` authors) are removed silently.
- Anything else (CJK, Hangul, Cyrillic, Devanagari, emoji, control characters) is dropped and counted; `npm run build` logs every dropped character with its count. When a character worth keeping shows up there, add it to `REPLACEMENTS`. After a drop, `tidy()` removes empty brackets, spaces before punctuation, dangling separators and parentheses around the whole text ("Text Layout - 中文排版需求" → "Text Layout", "吉野剛史 (Takeshi Yoshino)" → "Takeshi Yoshino"). A field or author that ends up empty is left out.
- Keys must be printable ASCII (a non-ASCII `\cite` key breaks under pdfLaTeX).
- URLs are left raw except `{`, `}` and everything outside printable ASCII, which are percent-encoded.
- The `.bib` starts with `%` comment lines (source, timestamp, attribution). Never put `@` in them: BibTeX would start parsing an entry.
- Validation done so far (TeX Live 2026 in Docker): biber parses all entries (only warnings: an upstream ISBN typo in `IEEE-754*`); every entry containing a LaTeX escape plus a random sample compiles with biblatex/biber + LuaLaTeX, and the ASCII ones with BibTeX `plain` + pdfLaTeX. Typesetting all 70k entries in one document is impractical (biblatex takes hours).
- Character handling validated (same setup, default `article`, no packages): the 5,327 entries that contain non-ASCII text or changed with it compile without errors or missing glyphs with BibTeX `plain`/`abbrv` + pdfLaTeX, BibTeX `IEEEtran` + `url` + pdfLaTeX, and biber + pdfLaTeX/LuaLaTeX (biber runs split into two documents: all 5,327 in one exceed pdfTeX's main memory). Check logs with `grep -a`: macOS grep treats LaTeX logs as binary and silently prints nothing.
- Known limitation: classic BibTeX styles that build labels from the first bytes of names (`alpha`, `amsalpha`) break on UTF-8 (`Kr` + half of `ü`) and `width$` rejects non-ASCII. Only an all-ASCII file would fix that; biblatex's `alphabetic` style works.
- Known limitation: in pdfLaTeX's default OT1 encoding `<`, `>` and `|` print as ¡, ¿ and —. They are left as-is (`\textless` would be decoded back to `<` by biber anyway); the README tells pdfLaTeX users to load T1.
- Known limitation: author-year `.bst` styles like `plainnat` break when more than 26 *cited* entries share a label (e.g. author-less ETSI specs from one year): `natexlab` suffixes run past `z`. That's the style's limit; don't add a `key` field to work around it without a better label source.

## Page (`site/`)

Loads `meta.json` then `specref.bib`, splits entries on `\n@`, and searches lowercased entry text (all terms must match). Search ignores case and accents: `LATEX_LETTER` turns the letter commands from `escapeName` (`{\"{U}}`, `{\L}`) back into letters, then haystack and query drop combining marks after NFD. Keep the regex and `LETTER_COMMANDS` in sync with `letterCommand` and `LETTERS` in `src/latex.ts`. Ranking: exact key, exact alias (`ids`), key prefix, rest. Shows at most 50 results. The query is mirrored to `?q=` for shareable links. `Meta` is declared in both `src/build.ts` and `site/app.ts`; keep them in sync.

## Workflow notes

- The `keepalive` job re-enables the workflow through the API on scheduled runs, because GitHub disables cron workflows after 60 days without repo activity and deploys create no commits.
- GitHub Pages must be set to "GitHub Actions" as source in the repo settings.

## Licensing

Code is Apache-2.0 (same as Specref's code). Specref data is CC0. `STATUS_LABELS` in `src/bibtex.ts` is adapted from Specref's `docs/js/search.js`, attributed in the code comment and in `NOTICE`. Keep `NOTICE` updated if more Specref code is reused.
