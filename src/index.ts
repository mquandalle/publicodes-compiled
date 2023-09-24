import { parse, parseJsObject } from "./parser";
import { compile } from "./compiler";

export class CompiledPublicodes {
  compiledRules: any;
  cache: any = {};
  traversedRulesCache: any = {};
  compiledSituation: any = {};

  constructor(source: string) {
    const jsCode = compile(parse(source));
    this.compiledRules = eval(jsCode)();
  }

  evaluate(ruleName: string) {
    const r = (x: string) => {
      this.cache[x] ??=
        this.compiledSituation[x]?.(r) ?? this.compiledRules[x](r);
      return this.cache[x];
    };
    return r(ruleName);
  }

  // Le calcul des règles traversées est long, même avec cette implémentation
  // optimisée. Peut-être que la collecte de l'intégralité des variables
  // traversées est inutile et que le besoin concerne uniquement un
  // sous-ensemble de règles à la manière des "missingVariables", et que se
  // réseindre de cette manière permettrait d'accélerer la collecte.
  traversedRules(ruleName: string) {
    const traversedRulesStack: string[] = [];
    const r = (x: string) => {
      if (!this.traversedRulesCache[x]) {
        const traversedRulesStartIndex = traversedRulesStack.length;
        traversedRulesStack.push(x);

        this.cache[x] =
          this.compiledSituation[x]?.(r) ?? this.compiledRules[x](r);
        this.traversedRulesCache[x] = traversedRulesStack.slice(
          traversedRulesStartIndex
        );
      }
      return this.cache[x];
    };

    r(ruleName);
    return Array.from(new Set(this.traversedRulesCache[ruleName]));
  }

  setSituation(situation: Record<string, any>) {
    this.resetCache();
    this.compiledSituation = eval(
      compile(parseJsObject(situation, { availableRules: this.compiledRules }))
    )();
    return this;
  }

  resetCache() {
    this.cache = {};
    this.traversedRulesCache = {};
  }
}

export default CompiledPublicodes;
