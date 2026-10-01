// Turns free-form Specref text into LaTeX that compiles as-is with pdfLaTeX
// (default OT1 font encoding, no packages), LuaLaTeX and XeLaTeX, through
// BibTeX as well as biber. Characters LaTeX reads natively stay UTF-8; the
// rest is written as LaTeX commands, simplified, or dropped.

// Called once per character that has no LaTeX equivalent and was left out.
export type DropHandler = (char: string) => void;

const SPECIALS: Record<string, string> = {
  "\\": "{\\textbackslash}",
  // BibTeX counts braces even when escaped, so `\{` could unbalance a field.
  "{": "{\\textbraceleft}",
  "}": "{\\textbraceright}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "^": "{\\textasciicircum}",
  "~": "{\\textasciitilde}",
};

// Non-ASCII characters that pdfLaTeX accepts as UTF-8 in a plain document and
// that LuaLaTeX's default font (Latin Modern) has glyphs for. Measured with
// TeX Live 2026 by compiling each character on its own. Only NFC forms are
// listed, since text is normalized to NFC first.
const NATIVE = new Set(
  [
    // Latin-1 Supplement
    "¡¢£¤¥¦§¨©ª¬®¯°±²³´µ¶·¸¹º¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖ×ØÙÚÛÜÝßàáâãäåæçèéêëìíîïñòóôõö÷øùúûüýÿ",
    // Latin Extended-A
    "ĀāĂăĆćĈĉĊċČčĎďĒēĔĕĖėĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭİıĲĳĴĵĶķĹĺĻļĽľŁłŃńŅņŇňŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŴŵŶŷŸŹźŻżŽž",
    // Latin Extended-B, spacing modifiers, Latin Extended Additional
    "ƒǍǎǏǐǑǒǓǔǦǧǰǴǵȘșȚțȷˆˇ˘˙˜˝ḍḥḷṃṅṇṛṣṭẞỲỳ",
    // Punctuation and symbols
    "‐‑–—‖‘’“”†‡•…‰‱※‽⁄⁒₡₤₦₩₫€₱℃№℗℞℠™℧℮←↑→↓◦♪ﬀﬁﬂﬃﬄ",
  ].join(""),
);

// Replacements for characters that are not NATIVE.
const REPLACEMENTS: Record<string, string> = {
  // Missing from Latin Modern.
  "\u2012": "–",
  "\u2015": "—",
  "\u27e8": "<",
  "\u27e9": ">",
  "\u3008": "<",
  "\u3009": ">",
  // Only available with the T1 font encoding.
  "\u00ab": "“",
  "\u00bb": "”",
  "\u2039": "‘",
  "\u203a": "’",
  "\u201a": "‘",
  "\u201e": "“",
  "\u00d0": "D",
  "\u00f0": "d",
  "\u0110": "D",
  "\u0111": "d",
  "\u00de": "Th",
  "\u00fe": "th",
  "\u014a": "N",
  "\u014b": "n",
  // Math and Greek, which pdfLaTeX only knows in math mode.
  "\u2212": "-",
  "\u03bc": "µ",
  "\u03a9": "{\\ensuremath{\\Omega}}",
  "\u03c0": "{\\ensuremath{\\pi}}",
  "\u2260": "{\\ensuremath{\\neq}}",
  "\u2264": "{\\ensuremath{\\leq}}",
  "\u2265": "{\\ensuremath{\\geq}}",
  "\u221e": "{\\ensuremath{\\infty}}",
  // Specref text that was already garbled upstream. A visible marker beats
  // silently misspelling a name.
  "\ufffd": "?",
};

// Letters without a canonical decomposition, as commands.
const LETTERS: Record<string, string> = {
  ß: "\\ss",
  æ: "\\ae",
  Æ: "\\AE",
  œ: "\\oe",
  Œ: "\\OE",
  ø: "\\o",
  Ø: "\\O",
  ł: "\\l",
  Ł: "\\L",
  ı: "\\i",
  ȷ: "\\j",
};

// Combining marks (after NFD) to the accent commands that exist in OT1.
const ACCENTS: Record<string, string> = {
  "\u0300": "`",
  "\u0301": "'",
  "\u0302": "^",
  "\u0303": "~",
  "\u0304": "=",
  "\u0306": "u",
  "\u0307": ".",
  "\u0308": '"',
  "\u030a": "r",
  "\u030b": "H",
  "\u030c": "v",
  "\u0323": "d",
  "\u0326": "textcommabelow",
  "\u0327": "c",
  "\u0331": "b",
};

// Accents replace the dot of i and j, so "ı" + U+0301 is "í".
const DOTTED: Record<string, string> = { ı: "i", ȷ: "j" };

// A few Specref fields contain HTML entities.
const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
};

// Collapses whitespace, drops invisible characters (zero-width spaces, soft
// hyphens, fillers like U+3164) and escapes LaTeX specials. Characters LaTeX
// can't read natively become commands or simpler characters; those without
// any equivalent (CJK, emoji, ...) are dropped and reported to `onDropped`.
export function escapeLatex(text: string, onDropped?: DropHandler): string {
  return toLatex(text, onDropped, false);
}

// Like escapeLatex, but a non-ASCII letter that starts a word is written as a
// command ({\"{U}}mit). Classic BibTeX reads names byte by byte and needs the
// first letter of each word to tell given names from particles like "von"
// and to abbreviate them.
export function escapeName(name: string, onDropped?: DropHandler): string {
  return toLatex(name, onDropped, true);
}

function toLatex(text: string, onDropped: DropHandler | undefined, commandsAtWordStart: boolean): string {
  let droppedAny = false;
  const report: DropHandler = (char) => {
    droppedAny = true;
    onDropped?.(char);
  };
  let latex = "";
  for (const cluster of clusters(decodeHtmlEntities(text))) {
    const atWordStart = latex === "" || /[\s~-]$/.test(latex);
    latex += clusterToLatex(cluster, report, commandsAtWordStart && atWordStart);
  }
  const collapsed = latex.replace(/\s+/g, " ").trim();
  return droppedAny ? tidy(collapsed) : collapsed;
}

// A base character followed by its combining marks, composed where Unicode
// allows it ("e" + U+0301 → "é"). Leading marks form their own cluster.
function clusters(text: string): string[] {
  return text.normalize("NFC").match(/\p{M}+|\P{M}\p{M}*/gu) ?? [];
}

function clusterToLatex(cluster: string, onDropped: DropHandler, asCommand: boolean): string {
  if (NATIVE.has(cluster)) return (asCommand && letterCommand(cluster)) || cluster;
  const replacement = REPLACEMENTS[cluster];
  if (replacement !== undefined) return replacement;
  const [base = "", ...marks] = cluster.normalize("NFD");
  if (marks.length > 0 && /\p{L}/u.test(base)) {
    const letter = simplifyLetter(base, marks, onDropped);
    if (letter !== undefined) return clusterToLatex(letter, onDropped, asCommand);
  }
  const latex = charToLatex(base);
  const lost = latex === undefined ? cluster : marks;
  for (const char of lost) onDropped(char);
  return latex ?? "";
}

// The letter with as many of its marks as LaTeX can typeset natively, e.g.
// "ą" → "a" (the ogonek needs T1). Undefined if not even the base letter works.
function simplifyLetter(base: string, marks: string[], onDropped: DropHandler): string | undefined {
  for (let kept = marks.length; kept >= 0; kept--) {
    const letter = kept > 0 ? (DOTTED[base] ?? base) : base;
    const candidate = (letter + marks.slice(0, kept).join("")).normalize("NFC");
    if (NATIVE.has(candidate) || /^[A-Za-z]$/.test(candidate)) {
      for (const mark of marks.slice(kept)) onDropped(mark);
      return candidate;
    }
  }
  return undefined;
}

// A NATIVE letter as a braced command ({\'{E}}, {\L}), braced so BibTeX
// treats it as a single letter. Undefined for anything else.
function letterCommand(char: string): string | undefined {
  const [base = "", ...marks] = char.normalize("NFD");
  let latex = /^[A-Za-z]$/.test(base) ? base : LETTERS[base];
  if (latex === undefined || (marks.length === 0 && latex === base)) return undefined;
  for (const mark of marks) {
    const accent = ACCENTS[mark];
    if (accent === undefined) return undefined;
    latex = `\\${accent}{${latex}}`;
  }
  return `{${latex}}`;
}

// LaTeX for a single character outside NATIVE and REPLACEMENTS, or undefined
// if it has no equivalent.
function charToLatex(char: string): string | undefined {
  if (/\s/.test(char)) return " ";
  if (/\p{Default_Ignorable_Code_Point}/u.test(char)) return "";
  if (/^[ -~]$/.test(char)) return SPECIALS[char] ?? char;
  return compatibilityToLatex(char);
}

// Falls back to the compatibility decomposition: 𝒪 → O, ？ → ?.
function compatibilityToLatex(char: string): string | undefined {
  const compatible = char.normalize("NFKD");
  if (compatible === char) return undefined;
  let complete = true;
  const latex = clusters(compatible)
    .map((cluster) =>
      clusterToLatex(cluster, () => {
        complete = false;
      }, false),
    )
    .join("");
  return complete ? latex : undefined;
}

// Dropping characters can leave empty brackets or dangling separators behind,
// e.g. "Text Layout - 中文排版需求" or "吉野剛史 (Takeshi Yoshino)".
function tidy(text: string): string {
  const tidied = text
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/ (?=[.,;:!?])/g, "")
    .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, "");
  return /^\([^()]*\)$/.test(tidied) ? tidied.slice(1, -1) : tidied;
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (entity, decimal, hex, name) => {
    const codePoint = decimal ? Number(decimal) : hex ? parseInt(hex, 16) : undefined;
    if (codePoint === undefined) return HTML_ENTITIES[name.toLowerCase()] ?? entity;
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
  });
}
