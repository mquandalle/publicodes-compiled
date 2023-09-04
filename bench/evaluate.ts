import Publicodes from "publicodes";
import { CompiledPublicodes } from "../src";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as yamlParse } from "yaml";
import { bench, group, run } from "mitata";

const rawSource = readFileSync(
  path.join(import.meta.dir, "./sasu.publicodes.yaml"),
  "utf8"
);
const RULE_NAME = "revenu net après impôt";

const interpretedEngine = new Publicodes(yamlParse(rawSource));
const compiledEngine = new CompiledPublicodes(rawSource);

if (
  interpretedEngine.evaluate(RULE_NAME).nodeValue !==
  compiledEngine.evaluate(RULE_NAME)
) {
  throw new Error("Compiled and interpreted engines do not agree");
}

group("transform from source", () => {
  bench("current", () => {
    new Publicodes(yamlParse(rawSource));
  });
  bench("reimplementation", () => {
    new CompiledPublicodes(rawSource);
  });
});

group("evaluate rule", () => {
  bench("interpreted", () => {
    interpretedEngine.resetCache();
    interpretedEngine.evaluate(RULE_NAME);
  });

  bench("compiled", () => {
    compiledEngine.resetCache();
    compiledEngine.evaluate(RULE_NAME);
  });
});

run();
