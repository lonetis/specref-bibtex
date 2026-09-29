import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { collectAliases, resolve, type SpecrefDump } from "../src/specref.ts";

const dump: SpecrefDump = {
  rfc7230: { id: "rfc7230", title: "HTTP/1.1" },
  RFC7230: { id: "RFC7230", aliasOf: "rfc7230" },
  HTTP11: { id: "HTTP11", aliasOf: "RFC7230" },
  css2: { id: "css2", aliasOf: "CSS21" },
  CSS2: { id: "CSS2", aliasOf: "css2" },
  CSS21: { id: "CSS21", title: "CSS 2.1" },
  DANGLING: { id: "DANGLING", aliasOf: "missing" },
  LOOP1: { id: "LOOP1", aliasOf: "LOOP2" },
  LOOP2: { id: "LOOP2", aliasOf: "LOOP1" },
};

describe("resolve", () => {
  test("follows alias chains", () => {
    assert.equal(resolve(dump, "HTTP11")?.id, "rfc7230");
  });

  test("returns undefined for dangling and cyclic aliases", () => {
    assert.equal(resolve(dump, "DANGLING"), undefined);
    assert.equal(resolve(dump, "LOOP1"), undefined);
  });
});

describe("collectAliases", () => {
  test("groups aliases by entry and skips case-only variants", () => {
    assert.deepEqual(
      collectAliases(dump),
      new Map([
        ["rfc7230", ["HTTP11"]],
        ["CSS21", ["css2"]],
      ]),
    );
  });
});
