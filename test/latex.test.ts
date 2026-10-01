import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { escapeLatex, escapeName } from "../src/latex.ts";

function escapeWithDrops(text: string): { latex: string; dropped: string[] } {
  const dropped: string[] = [];
  return { latex: escapeLatex(text, (char) => dropped.push(char)), dropped };
}

describe("escapeLatex", () => {
  test("escapes LaTeX special characters", () => {
    assert.equal(escapeLatex("A & B_1 50% #2 $5"), "A \\& B\\_1 50\\% \\#2 \\$5");
    assert.equal(escapeLatex("x^2 ~S \\n"), "x{\\textasciicircum}2 {\\textasciitilde}S {\\textbackslash}n");
  });

  test("keeps braces balanced", () => {
    assert.equal(escapeLatex("T{expr"), "T{\\textbraceleft}expr");
  });

  test("decodes HTML entities and collapses whitespace", () => {
    assert.equal(escapeLatex("  Sign &amp; Encrypt &#8211;\n done\u00a0 "), "Sign \\& Encrypt – done");
  });

  test("keeps characters LaTeX reads natively as UTF-8", () => {
    const text = "Jörg Müller-Ščešnjak, Łukasz, Gauß, Țuțu, Erdős — “Quoted” ‘x’ … ™ § ‽ ﬁ ½";
    assert.deepEqual(escapeWithDrops(text), { latex: text, dropped: [] });
  });

  test("composes decomposed accents", () => {
    assert.equal(escapeLatex("Kamin\u0301ski Chochlı\u0301k"), "Kamiński Chochlík");
  });

  test("drops accents LaTeX can't typeset but keeps the letter", () => {
    assert.deepEqual(escapeWithDrops("ą Nguyễn ạ ǘ"), {
      latex: "a Nguyên a ü",
      dropped: ["\u0328", "\u0303", "\u0323", "\u0301"],
    });
  });

  test("replaces characters pdfLaTeX doesn't know in text mode", () => {
    assert.equal(
      escapeLatex("T ≠ void, «names», 75 Ω, ⟨utility⟩, Đorđević"),
      "T {\\ensuremath{\\neq}} void, “names”, 75 {\\ensuremath{\\Omega}}, <utility>, Dordević",
    );
  });

  test("falls back to compatibility decompositions", () => {
    assert.equal(escapeLatex("𝒪(1) section 4.12？"), "O(1) section 4.12?");
  });

  test("removes invisible characters", () => {
    assert.deepEqual(escapeWithDrops("\u3164 Pascoe"), { latex: "Pascoe", dropped: [] });
    assert.equal(
      escapeLatex("views\u200b::\u200ball is_\u00adnothrow optional<\u200dT&\u200d>"),
      "views::all is\\_nothrow optional<T\\&>",
    );
  });

  test("marks text that was already garbled upstream", () => {
    assert.equal(escapeLatex("Dietmar K\ufffdhl"), "Dietmar K?hl");
  });

  test("drops and reports characters without a LaTeX equivalent", () => {
    assert.deepEqual(escapeWithDrops("Robin Leroy 𒉭"), { latex: "Robin Leroy", dropped: ["𒉭"] });
    assert.deepEqual(escapeWithDrops("a\u0001b"), { latex: "ab", dropped: ["\u0001"] });
  });

  test("tidies up what dropped characters leave behind", () => {
    assert.equal(escapeLatex("Requirements for Chinese Text Layout - 中文排版需求"), "Requirements for Chinese Text Layout");
    assert.equal(escapeLatex("Text Layout — 中文"), "Text Layout");
    assert.equal(escapeLatex("Typography : 한국어 텍스트"), "Typography");
    assert.equal(escapeLatex("Japanese Text Layout 日本語組版処理の要件(日本語版)"), "Japanese Text Layout");
    assert.equal(escapeLatex("General Rules for Punctuation (《标点符号用法》)."), "General Rules for Punctuation.");
    assert.equal(escapeLatex("吉野剛史 (Takeshi Yoshino)"), "Takeshi Yoshino");
    assert.equal(escapeLatex("🦄 width: units"), "width: units");
  });
});

describe("escapeName", () => {
  test("writes non-ASCII letters that start a word as commands", () => {
    assert.equal(escapeName("Ümit Yalçinalp"), '{\\"{U}}mit Yalçinalp');
    assert.equal(escapeName("Tantek Çelik"), "Tantek {\\c{C}}elik");
    assert.equal(escapeName("Łukasz Żelechowski-Ćwik"), "{\\L}ukasz {\\.{Z}}elechowski-{\\'{C}}wik");
    assert.equal(escapeName("É. Vyncke"), "{\\'{E}}. Vyncke");
  });

  test("keeps the rest of the name as UTF-8", () => {
    assert.equal(escapeName("Tomasz Kamiński"), "Tomasz Kamiński");
    assert.equal(escapeName("\u3164 Pascoe"), "Pascoe");
  });
});
