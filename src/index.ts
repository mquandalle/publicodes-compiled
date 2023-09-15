import { parse } from "./parser";
import { compile } from "./compiler";
import { ImmutableList } from "./lib/linkedList";

export class CompiledPublicodes {
  compiledRules: any;
  cache: any;

  traversedRulesLList: InstanceType<typeof ImmutableList>;
  traversedRulesCache: any = {};

  constructor(source: string) {
    const jsCode = compile(parse(source));
    const r = (x: string) => this.evaluate(x);
    this.compiledRules = eval(jsCode)(r);
    this.cache = {};
    this.traversedRulesLList = new ImmutableList();
  }

  evaluate(ruleName: string) {
    if (!this.cache[ruleName]) {
      const traversedRulesParent = this.traversedRulesLList;
      this.traversedRulesLList = new ImmutableList().append(ruleName);
      this.cache[ruleName] = this.compiledRules[ruleName]();
      this.traversedRulesCache[ruleName] = this.traversedRulesLList;
      this.traversedRulesLList = traversedRulesParent.concat(
        this.traversedRulesLList
      );
    } else {
      this.traversedRulesLList = this.traversedRulesLList.concat(
        this.traversedRulesCache[ruleName]
      );
    }
    return this.cache[ruleName];
  }

  traversedRules(ruleName: string) {
    this.evaluate(ruleName);
    const traversedVariables = this.traversedRulesCache[ruleName];
    return Array.from(new Set(traversedVariables));
  }

  resetCache() {
    this.cache = {};
    this.traversedRulesCache = {};
  }
}

export default CompiledPublicodes;
