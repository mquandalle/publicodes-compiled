import { parse } from "./parser";
import { compile } from "./compiler";

export class CompiledPublicodes {
  compiledRules: any;
  cache: any;
  constructor(source: string) {
    const jsCode = compile(parse(source));
    const r = (x: string) => this.evaluate(x);
    this.compiledRules = eval(jsCode)(r);
    this.cache = {};
  }

  evaluate(ruleName: string) {
    this.cache[ruleName] ??= this.compiledRules[ruleName]();
    return this.cache[ruleName];
  }

  resetCache() {
    this.cache = {};
  }
}
