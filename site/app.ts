// Loads the generated BibTeX file and lets visitors copy all of it or search
// for single entries. Compiled to dist/app.js by `tsc -p site`.

// Mirrors the Meta written by src/build.ts.
interface Meta {
  source: string;
  generatedAt: string;
  entryCount: number;
  sizeBytes: number;
  file: string;
}

interface Entry {
  key: string;
  text: string;
  // Lowercased key followed by its aliases from the `ids` field.
  keys: string[];
  haystack: string;
}

const MAX_RESULTS = 50;
const SEARCH_DELAY_MS = 120;
const COPY_FEEDBACK_MS = 1500;

const numberFormat = new Intl.NumberFormat("en");

const entryCount = element("entry-count");
const fileSize = element("file-size");
const generatedAt = element<HTMLTimeElement>("generated-at");
const copyAllButton = element<HTMLButtonElement>("copy-all");
const searchInput = element<HTMLInputElement>("search");
const status = element("status");
const results = element<HTMLOListElement>("results");
const entryTemplate = element<HTMLTemplateElement>("entry-template");

let bibtex = "";
let entries: Entry[] = [];

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

async function fetchOk(url: string): Promise<Response> {
  // Bypass the HTTP cache so a fresh daily build is never masked.
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response;
}

function parseEntries(text: string): Entry[] {
  return text
    .split(/\n(?=@)/)
    .filter((chunk) => chunk.startsWith("@"))
    .map((chunk) => {
      const entryText = chunk.trim();
      const key = /^@\w+\{([^,]+),/.exec(entryText)?.[1] ?? "";
      const ids = /^ {2}ids = \{(.*)\}$/m.exec(entryText)?.[1]?.split(", ") ?? [];
      return {
        key,
        text: entryText,
        keys: [key, ...ids].map((k) => k.toLowerCase()),
        haystack: entryText.toLowerCase(),
      };
    });
}

// Lower is better: exact key, exact alias, key prefix, anything else.
function rank(entry: Entry, query: string): number {
  if (entry.keys[0] === query) return 0;
  if (entry.keys.includes(query)) return 1;
  if (entry.keys[0]?.startsWith(query)) return 2;
  return 3;
}

function search(query: string): Entry[] {
  const normalized = query.trim().toLowerCase();
  const terms = normalized.split(/\s+/);
  return entries
    .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    .sort((a, b) => rank(a, normalized) - rank(b, normalized));
}

function renderEntries(list: Entry[]): void {
  results.replaceChildren(
    ...list.map((entry) => {
      const item = entryTemplate.content.cloneNode(true) as DocumentFragment;
      item.querySelector(".entry-key")!.textContent = entry.key;
      item.querySelector(".entry-text")!.textContent = entry.text;
      const button = item.querySelector<HTMLButtonElement>(".copy")!;
      button.addEventListener("click", () => copy(button, entry.text));
      return item;
    }),
  );
}

function update(): void {
  const query = searchInput.value.trim();
  syncQueryToUrl(query);
  if (query === "") {
    renderEntries(entries.slice(0, MAX_RESULTS));
    status.textContent = `Showing the first ${MAX_RESULTS} of ${numberFormat.format(entries.length)} entries. Type to search.`;
    return;
  }
  const matches = search(query);
  renderEntries(matches.slice(0, MAX_RESULTS));
  status.textContent =
    matches.length === 0
      ? "No matching entries."
      : matches.length > MAX_RESULTS
        ? `Showing ${MAX_RESULTS} of ${numberFormat.format(matches.length)} matches. Refine your search to narrow it down.`
        : `${numberFormat.format(matches.length)} ${matches.length === 1 ? "match" : "matches"}.`;
}

function syncQueryToUrl(query: string): void {
  const url = new URL(location.href);
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  history.replaceState(null, "", url);
}

async function copy(button: HTMLButtonElement, text: string): Promise<void> {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch (error) {
    console.error("Copying to the clipboard failed", error);
    button.textContent = "Copy failed";
  }
  setTimeout(() => {
    button.textContent = label;
  }, COPY_FEEDBACK_MS);
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  const meta: Meta = await (await fetchOk("meta.json")).json();
  entryCount.textContent = numberFormat.format(meta.entryCount);
  fileSize.textContent = formatBytes(meta.sizeBytes);
  generatedAt.dateTime = meta.generatedAt;
  generatedAt.textContent = new Date(meta.generatedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  bibtex = await (await fetchOk(meta.file)).text();
  entries = parseEntries(bibtex);

  copyAllButton.disabled = false;
  copyAllButton.addEventListener("click", () => copy(copyAllButton, bibtex));

  let timer: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(update, SEARCH_DELAY_MS);
  });
  searchInput.value = new URLSearchParams(location.search).get("q") ?? "";
  searchInput.disabled = false;
  update();
}

main().catch((error: unknown) => {
  console.error(error);
  status.textContent = `Could not load the BibTeX file (${error instanceof Error ? error.message : String(error)}). You can still try the download link above.`;
});
