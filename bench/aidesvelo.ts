import Publicodes from "publicodes";
import { CompiledPublicodes } from "../src";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as yamlParse } from "yaml";
import { bench, group, run } from "mitata";
import { parse } from "../src/parser";

const rawSource = readFileSync(
  path.join(import.meta.dir, "./aidesvelo.publicodes.yaml"),
  "utf8"
);

// if (
//   interpretedEngine.evaluate(RULE_NAME).nodeValue !==
//   compiledEngine.evaluate(RULE_NAME)
// ) {
//   throw new Error("Compiled and interpreted engines do not agree");
// }

group("transform from source", () => {
  bench("current", () => {
    new Publicodes(yamlParse(rawSource));
  });
  bench("reimplementation", () => {
    // new CompiledPublicodes(rawSource);
    parse(rawSource);
  });
});

run();
