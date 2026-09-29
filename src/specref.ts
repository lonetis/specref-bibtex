// Shape of the full dump returned by `GET https://api.specref.org/bibrefs`
// (no `refs` parameter). See https://github.com/specinfra/specref#api.

export interface SpecrefEntry {
  id: string;
  title: string;
  href?: string;
  authors?: string[];
  etAl?: boolean;
  date?: string;
  status?: string;
  publisher?: string;
  isbn?: string;
  pages?: string;
  versionOf?: string;
}

export interface SpecrefAlias {
  id: string;
  aliasOf: string;
}

export type SpecrefRef = SpecrefEntry | SpecrefAlias;

export type SpecrefDump = Record<string, SpecrefRef>;

export function isAlias(ref: SpecrefRef): ref is SpecrefAlias {
  return "aliasOf" in ref;
}

export async function fetchDump(url: string): Promise<SpecrefDump> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "specref-bibtex (+https://github.com/lonetis/specref-bibtex)",
    },
  });
  if (!response.ok) {
    throw new Error(`Fetching ${url} failed: ${response.status} ${response.statusText}`);
  }
  const dump: unknown = await response.json();
  if (typeof dump !== "object" || dump === null || Array.isArray(dump)) {
    throw new Error(`Unexpected response from ${url}: expected a JSON object of references`);
  }
  return dump as SpecrefDump;
}

// Follows `aliasOf` chains to the entry they point to. Returns undefined for
// dangling or cyclic chains.
export function resolve(dump: SpecrefDump, key: string): SpecrefEntry | undefined {
  const seen = new Set<string>();
  let ref = dump[key];
  while (ref && isAlias(ref)) {
    if (seen.has(ref.aliasOf)) return undefined;
    seen.add(ref.aliasOf);
    ref = dump[ref.aliasOf];
  }
  return ref;
}

// Maps each entry id to the alias keys that resolve to it. Aliases that only
// differ by case from the key they point to are skipped: Specref generates an
// uppercase alias for every key, and BibTeX keys are case-insensitive anyway.
export function collectAliases(dump: SpecrefDump): Map<string, string[]> {
  const aliases = new Map<string, string[]>();
  for (const [key, ref] of Object.entries(dump)) {
    if (!isAlias(ref) || sameIgnoringCase(key, ref.aliasOf)) continue;
    const target = resolve(dump, key);
    if (!target || sameIgnoringCase(key, target.id)) continue;
    const list = aliases.get(target.id) ?? [];
    list.push(key);
    aliases.set(target.id, list);
  }
  return aliases;
}

function sameIgnoringCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
