import { describe, beforeEach, it, expect } from "bun:test";
import Publicodes from "../src/index";

describe("Traversed variables - Basics", () => {
  let engine: InstanceType<typeof Publicodes>;
  beforeEach(() => {
    //TODO: support parsing for JS objects
    // engine = new Publicodes({
    // 	a: 1,
    // 	b: '1 + a',
    // 	c: '1 + a + a',
    // 	d: 'e',
    // 	e: 1,

    // 	branches: 'b + f',
    // 	f: 'g',
    // 	g: 1,
    // })
    engine = new Publicodes(
      `
a: 1
b: 1 + a
c: 1 + a + a
d: e
e: 1

branches: b + f
f: g
g: 1
`.trim()
    );
  });
  it.skip("should be empty if there are no external references", () => {
    expect(engine.traversedRules("5 + 5")).toEqual([]);
  });
  it("should countain single rule if it has no dependency", () => {
    expect(engine.traversedRules("a")).toEqual(["a"]);
  });
  it("should not be polluted by previous evaluations", () => {
    expect(engine.traversedRules("a")).toEqual(["a"]);
    engine.traversedRules("d");
    expect(engine.traversedRules("d")).toEqual(["d", "e"]);
  });
  it("should contain simple dependency", () => {
    expect(engine.traversedRules("b")).toEqual(["b", "a"]);
  });
  it("should contain simple dependency without duplication", () => {
    expect(engine.traversedRules("c")).toEqual(["c", "a"]);
  });
  it("should not be polluted by previous term in an operation", () => {
    engine.traversedRules("branches");
    expect(engine.traversedRules("f")).toEqual(["f", "g"]);
  });
});
