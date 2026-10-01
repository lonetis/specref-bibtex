import { escapeLatex, escapeName, type DropHandler } from "./latex.ts";
import { collectAliases, isAlias, type SpecrefDump, type SpecrefEntry } from "./specref.ts";

// Adapted from REF_STATUSES in Specref's docs/js/search.js
// (https://github.com/specinfra/specref, Apache License 2.0).
const STATUS_LABELS: Record<string, string> = {
  NOTE: "W3C Note",
  "WG-NOTE": "W3C Working Group Note",
  ED: "W3C Editor's Draft",
  FPWD: "W3C First Public Working Draft",
  WD: "W3C Working Draft",
  LCWD: "W3C Last Call Working Draft",
  CR: "W3C Candidate Recommendation",
  PR: "W3C Proposed Recommendation",
  PER: "W3C Proposed Edited Recommendation",
  REC: "W3C Recommendation",
  // Newer W3C maturity levels, not part of the Specref table.
  CRD: "W3C Candidate Recommendation Draft",
  DNOTE: "W3C Group Draft Note",
  DRY: "W3C Draft Registry",
  STMT: "W3C Statement",
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// Printable ASCII (a non-ASCII key breaks \cite under pdfLaTeX) without the
// characters BibTeX and biber cannot handle in a citation key.
const VALID_KEY = /^(?:(?![,{}()=#%"'\\~])[!-~])+$/;

// BibTeX splits names on " and " and reads commas as "Last, First". Specref
// names are free-form ("R. Fielding, Ed.", "IAB and IESG", "Tab Atkins Jr."),
// so those are braced to be printed verbatim.
const VERBATIM_NAME = /,|\sand\s|\s(?:Jr|Sr)\.?$/i;

const keyCollator = new Intl.Collator("en", { numeric: true });

export interface BibtexDate {
  year?: string;
  month?: string;
}

export interface Conversion {
  // Formatted entries, sorted by key.
  entries: string[];
  // Ids of Specref entries that are not usable as BibTeX keys.
  skipped: string[];
  // Characters without a LaTeX equivalent that were left out, with counts.
  dropped: Map<string, number>;
}

export interface HeaderInfo {
  source: string;
  generatedAt: string;
  entryCount: number;
}

export function convert(dump: SpecrefDump): Conversion {
  const aliases = collectAliases(dump);
  const valid: SpecrefEntry[] = [];
  const skipped: string[] = [];
  for (const ref of Object.values(dump)) {
    if (isAlias(ref)) continue;
    if (VALID_KEY.test(ref.id)) valid.push(ref);
    else skipped.push(ref.id);
  }
  valid.sort((a, b) => keyCollator.compare(a.id, b.id));
  const dropped = new Map<string, number>();
  const countDropped: DropHandler = (char) => dropped.set(char, (dropped.get(char) ?? 0) + 1);
  return {
    entries: valid.map((entry) => formatEntry(entry, aliases.get(entry.id), countDropped)),
    skipped,
    dropped,
  };
}

export function formatEntry(
  entry: SpecrefEntry,
  aliases: readonly string[] = [],
  onDropped?: DropHandler,
): string {
  const text = (value: string | undefined) => value && escapeLatex(value, onDropped);
  const { year, month }: BibtexDate = entry.date ? parseDate(entry.date) : {};
  const status = entry.status && (STATUS_LABELS[entry.status] ?? entry.status);
  const title = text(entry.title);
  const ids = aliases.filter((alias) => VALID_KEY.test(alias));
  const fields: Array<[name: string, value: string | undefined]> = [
    ["author", braced(formatAuthors(entry, onDropped))],
    // Double braces keep the capitalization of acronyms like HTTP or CSS.
    ["title", braced(title && `{${title}}`)],
    ["howpublished", braced(text(entry.publisher))],
    ["note", braced(text(status))],
    ["year", braced(year)],
    // Month macros (jan, feb, ...) must stay unbraced.
    ["month", month],
    ["isbn", braced(text(entry.isbn))],
    ["pages", braced(text(entry.pages))],
    ["url", braced(entry.href && formatUrl(entry.href))],
    // biblatex resolves citations of these keys to this entry.
    ["ids", braced(ids.length > 0 ? ids.join(", ") : undefined)],
  ];
  const body = fields
    .filter((field): field is [string, string] => field[1] !== undefined)
    .map(([name, value]) => `  ${name} = ${value}`)
    .join(",\n");
  return `@misc{${entry.id},\n${body}\n}`;
}

// Handles every date format found in the dump: "2023", "20091230",
// "June 2014" and "12 September 2013".
export function parseDate(date: string): BibtexDate {
  const compact = /^(\d{4})(\d{2})\d{2}$/.exec(date.trim());
  if (compact) return { year: compact[1], month: monthMacro(Number(compact[2]) - 1) };
  const year = /\b\d{4}\b/.exec(date)?.[0];
  const monthName = /[a-z]+/i.exec(date)?.[0].toLowerCase();
  return { year, month: monthName === undefined ? undefined : monthMacro(MONTHS.indexOf(monthName)) };
}

export function renderHeader({ source, generatedAt, entryCount }: HeaderInfo): string {
  return [
    "Specref BibTeX export",
    `Source: ${source}`,
    `Generated: ${generatedAt}`,
    `Entries: ${entryCount}`,
    "",
    "Reference data from Specref (https://www.specref.org/), dedicated to the",
    "public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/).",
    "Converted by specref-bibtex (https://github.com/lonetis/specref-bibtex).",
  ]
    .map((line) => `% ${line}`.trimEnd())
    .join("\n");
}

function formatAuthors(entry: SpecrefEntry, onDropped?: DropHandler): string | undefined {
  const names = (entry.authors ?? [])
    .map((name) => escapeName(name, onDropped))
    // Some names carry a leftover list separator ("and Jörg Schwenk"), which
    // would produce an empty name between two `and`s.
    .map((name) => name.replace(/^and\b\s*|\s*\band$/gi, ""))
    .filter((name) => name !== "")
    .map((name) => (VERBATIM_NAME.test(name) ? `{${name}}` : name));
  if (names.length === 0) return undefined;
  if (entry.etAl) names.push("others");
  return names.join(" and ");
}

// URLs are verbatim in biblatex, so only characters that would break the
// BibTeX syntax and anything outside printable ASCII are percent-encoded.
function formatUrl(href: string): string {
  return href.trim().replace(/[^!-~]|[{}]/gu, encodeURIComponent);
}

function monthMacro(index: number): string | undefined {
  return MONTHS[index]?.slice(0, 3);
}

function braced(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : `{${value}}`;
}
