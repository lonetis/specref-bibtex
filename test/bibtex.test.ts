import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { convert, escapeLatex, formatEntry, parseDate, renderHeader } from "../src/bibtex.ts";
import type { SpecrefDump } from "../src/specref.ts";

describe("parseDate", () => {
  test("reads every date format used by Specref", () => {
    assert.deepEqual(parseDate("12 September 2013"), { year: "2013", month: "sep" });
    assert.deepEqual(parseDate("June 2014"), { year: "2014", month: "jun" });
    assert.deepEqual(parseDate("20091230"), { year: "2009", month: "dec" });
    assert.deepEqual(parseDate("2023"), { year: "2023", month: undefined });
  });

  test("ignores words that are not months", () => {
    assert.deepEqual(parseDate("Q3 2020"), { year: "2020", month: undefined });
  });
});

describe("escapeLatex", () => {
  test("escapes LaTeX special characters", () => {
    assert.equal(escapeLatex("A & B_1 50% #2 $5"), "A \\& B\\_1 50\\% \\#2 \\$5");
    assert.equal(escapeLatex("x^2 ~S \\n"), "x\\textasciicircum{}2 \\textasciitilde{}S \\textbackslash{}n");
  });

  test("keeps braces balanced", () => {
    assert.equal(escapeLatex("T{expr"), "T\\textbraceleft{}expr");
  });

  test("decodes HTML entities and collapses whitespace", () => {
    assert.equal(escapeLatex("  Sign &amp; Encrypt &#8211;\n done "), "Sign \\& Encrypt – done");
  });
});

describe("formatEntry", () => {
  test("formats a full entry", () => {
    const entry = formatEntry(
      {
        id: "rfc7230",
        title: "Hypertext Transfer Protocol (HTTP/1.1): Message Syntax and Routing",
        href: "https://httpwg.org/specs/rfc7230.html",
        authors: ["R. Fielding, Ed.", "J. Reschke, Ed."],
        date: "June 2014",
        status: "Proposed Standard",
        publisher: "IETF",
      },
      ["HTTP11"],
    );
    assert.equal(
      entry,
      [
        "@misc{rfc7230,",
        "  author = {{R. Fielding, Ed.} and {J. Reschke, Ed.}},",
        "  title = {{Hypertext Transfer Protocol (HTTP/1.1): Message Syntax and Routing}},",
        "  howpublished = {IETF},",
        "  note = {Proposed Standard},",
        "  year = {2014},",
        "  month = jun,",
        "  url = {https://httpwg.org/specs/rfc7230.html},",
        "  ids = {HTTP11}",
        "}",
      ].join("\n"),
    );
  });

  test("omits missing fields", () => {
    assert.equal(formatEntry({ id: "X", title: "Only a title" }), "@misc{X,\n  title = {{Only a title}}\n}");
  });

  test("keeps plain names parseable and protects the rest", () => {
    const entry = formatEntry({
      id: "X",
      title: "T",
      authors: ["Jane Doe", "IAB and IESG", "Tab Atkins Jr.", "Barnes, R"],
      etAl: true,
    });
    assert.match(entry, /author = \{Jane Doe and \{IAB and IESG\} and \{Tab Atkins Jr\.\} and \{Barnes, R\} and others\}/);
  });

  test("drops leftover list separators from names", () => {
    const entry = formatEntry({ id: "X", title: "T", authors: ["Lijun Liao", "and Jörg Schwenk", "Ann Lee and", "and", "Brand Anderson"] });
    assert.match(entry, /author = \{Lijun Liao and Jörg Schwenk and Ann Lee and Brand Anderson\}/);
  });

  test("labels W3C status codes", () => {
    assert.match(formatEntry({ id: "X", title: "T", status: "WD" }), /note = \{W3C Working Draft\}/);
  });

  test("encodes characters that would break the url field", () => {
    assert.match(formatEntry({ id: "X", title: "T", href: "https://e.org/a b{c}" }), /url = \{https:\/\/e\.org\/a%20b%7Bc%7D\}/);
  });
});

describe("convert", () => {
  const dump: SpecrefDump = {
    b: { id: "b", title: "B" },
    a10: { id: "a10", title: "A10" },
    a2: { id: "a2", title: "A2" },
    "a2-20200101": { id: "a2-20200101", title: "A2", versionOf: "a2" },
    ALIAS: { id: "ALIAS", aliasOf: "a2" },
    "bad key": { id: "bad key", title: "Bad" },
  };

  test("emits entries and dated versions sorted by key, skipping aliases and invalid keys", () => {
    const { entries, skipped } = convert(dump);
    assert.deepEqual(
      entries.map((entry) => /^@misc\{([^,]+),/.exec(entry)?.[1]),
      ["a2", "a2-20200101", "a10", "b"],
    );
    assert.match(entries[0] ?? "", /ids = \{ALIAS\}/);
    assert.deepEqual(skipped, ["bad key"]);
  });
});

describe("renderHeader", () => {
  test("only contains comment lines and no entry markers", () => {
    const header = renderHeader({ source: "https://example.org", generatedAt: "2026-01-01T00:00:00.000Z", entryCount: 3 });
    for (const line of header.split("\n")) assert.match(line, /^%/);
    assert.doesNotMatch(header, /@/);
  });
});
