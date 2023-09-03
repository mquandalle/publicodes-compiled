import { parse } from "./src/parse";
import { compile } from "./src/compile";

export class CompiledPublicodes {
  compiledRules: any;
  cache: any;
  constructor(source: string) {
    const jsCode = compile(parse(source));
    this.compiledRules = eval(jsCode);
    this.cache = {};
  }

  evaluate(ruleName: string) {
    this.cache[ruleName] ??= this.compiledRules[ruleName]((x: string) =>
      this.evaluate(x)
    );

    return this.cache[ruleName];
  }

  resetCache() {
    this.cache = {};
  }
}
