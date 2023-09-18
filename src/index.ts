import { parse } from "./parser";
import { compile } from "./compiler";

export class CompiledPublicodes {
  compiledRules: any;
  cache: any = {};
  traversedRulesCache: any = {};

  constructor(source: string) {
    const jsCode = compile(parse(source));
    this.compiledRules = eval(jsCode)();
  }

  evaluate(ruleName: string) {
    const r = (x: string) => {
      this.cache[x] ??= this.compiledRules[x](r);
      return this.cache[x];
    };
    return r(ruleName);
  }

  traversedRules(ruleName: string) {
    const traversedRulesStack: string[] = [];
    const r = (x: string) => {
      if (!this.traversedRulesCache[x]) {
        const traversedRulesStartIndex = traversedRulesStack.length;
        traversedRulesStack.push(x);

        this.cache[x] = this.compiledRules[x](r);
        this.traversedRulesCache[x] = traversedRulesStack.slice(
          traversedRulesStartIndex
        );
      }
      return this.cache[x];
    };

    r(ruleName);
    return Array.from(new Set(this.traversedRulesCache[ruleName]));
  }

  resetCache() {
    this.cache = {};
    this.traversedRulesCache = {};
  }
}

export default CompiledPublicodes;
