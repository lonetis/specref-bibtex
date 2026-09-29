// Builds the static site: fetches the Specref dump, converts it to BibTeX and
// writes it next to the page assets. The page script is compiled separately
// by `tsc -p site` (see the build script in package.json).

import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { convert, renderHeader } from "./bibtex.ts";
import { fetchDump } from "./specref.ts";

const OUTPUT_DIR = "dist";
const SITE_DIR = "site";
const BIBTEX_FILE = "specref.bib";

// Read by the page script (site/app.ts).
interface Meta {
  source: string;
  generatedAt: string;
  entryCount: number;
  sizeBytes: number;
  file: string;
}

async function main(): Promise<void> {
  const source = process.env.SPECREF_URL || "https://api.specref.org/bibrefs";

  console.log(`Fetching ${source}`);
  const dump = await fetchDump(source);
  const { entries, skipped } = convert(dump);
  if (entries.length === 0) {
    throw new Error(`No references found in ${source}`);
  }
  if (skipped.length > 0) {
    console.warn(`Skipped ${skipped.length} entries with ids that are not valid BibTeX keys: ${skipped.join(", ")}`);
  }

  const generatedAt = new Date().toISOString();
  const bibtex = `${renderHeader({ source, generatedAt, entryCount: entries.length })}\n\n${entries.join("\n\n")}\n`;
  const meta: Meta = {
    source,
    generatedAt,
    entryCount: entries.length,
    sizeBytes: Buffer.byteLength(bibtex),
    file: BIBTEX_FILE,
  };

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  await cp(SITE_DIR, OUTPUT_DIR, {
    recursive: true,
    filter: (path) => !path.endsWith(".ts") && !path.endsWith("tsconfig.json"),
  });
  await writeFile(`${OUTPUT_DIR}/${BIBTEX_FILE}`, bibtex);
  await writeFile(`${OUTPUT_DIR}/meta.json`, `${JSON.stringify(meta, null, 2)}\n`);

  console.log(`Wrote ${entries.length} entries to ${OUTPUT_DIR}/${BIBTEX_FILE}`);
}

await main();
