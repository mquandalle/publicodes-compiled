import { tokenize, type Token } from "./tokenize";
import { walk } from "zimmerframe";
import { conversionFactor, inferUnit } from "./units";

export type ASTNode =
  | { type: "constant"; value: number; unit?: string }
  | { type: "operation"; operator: string; left: ASTNode; right: ASTNode }
  | { type: "reference"; name: string }
  | { type: "produit"; assiette: ASTNode; taux: ASTNode }
  | {
      type: "barème";
      assiette: ASTNode;
      tranches: Array<{ taux: ASTNode; plafond?: ASTNode }>;
    };

type ASTRuleNode = { type: "rule"; name: string; value: ASTNode };

export type ASTPublicodesNode = {
  type: "publicodes";
  rules: Array<ASTRuleNode>;
};

export function parse(source: string): ASTPublicodesNode {
  const tokens: Token[] = tokenize(source);
  const parsedRules: ASTRuleNode[] = [];
  let index = 0;

  while (index < tokens.length) {
    const currentToken = tokens[index++];
    if (currentToken.type === "outdent") {
      continue;
    } else if (currentToken.type === "key") {
      const value =
        tokens[index]?.type === "key"
          ? {
              type: "constant",
              value: "undefined",
            }
          : parseExpression();
      parsedRules.push({ type: "rule", name: currentToken.value, value });
    } else {
      throw new Error(`Unexpected token ${currentToken.type}`);
    }
  }

  function parseExpression() {
    switch (tokens[index]?.type) {
      case "indent":
        index++; // skip the 'indent' token
        return parseMechanism();
      case "key":
        index++;
        if (tokens[index]?.type === "indent") {
          index++;
          return parseRecord();
        } else {
          return parseInlineExpression();
        }

      case "list-item":
        return parseList();
      default:
        return parseInlineExpression();
    }
  }

  function parseList() {
    const list = [];
    while (index < tokens.length && tokens[index].type === "list-item") {
      index++;
      if (tokens[index].type === "key") {
        list.push(parseRecord());
      } else {
        list.push(parseExpression());
      }
    }
    if (tokens[index].type === "outdent") {
      index++;
    }
    return list;
  }

  function parseRecord() {
    const record = {};

    while (index < tokens.length && tokens[index].type === "key") {
      const key = tokens[index++].value;
      record[key] = parseExpression();
    }
    return record;
  }

  function parseInlineExpression(): ASTNode {
    let node = parseTerm();

    while (index < tokens.length) {
      const token = tokens[index];
      if (
        token.type === "operator" &&
        (token.value === "+" || token.value === "-")
      ) {
        index++;
        const right = parseTerm();
        node = {
          type: "operation",
          operator: token.value,
          left: node,
          right,
        };
      } else {
        break;
      }
    }
    return node;
  }

  function parseTerm(): ASTNode {
    let node = parseFactor();

    while (index < tokens.length) {
      const token = tokens[index];
      if (
        token.type === "operator" &&
        (token.value === "*" || token.value === "/")
      ) {
        index++;
        const right = parseFactor();
        node = {
          type: "operation",
          operator: token.value,
          left: node,
          right,
        };
      } else {
        break;
      }
    }
    return node;
  }

  function parseFactor(): ASTNode {
    const token = tokens[index++];
    if (token.type === "constant") {
      return { type: "constant", value: token.value, unit: token.unit };
    } else if (token.type === "reference") {
      return { type: "reference", name: token.value };
    }
    throw new Error(`Unexpected token ${JSON.stringify(token)}`);
  }

  function parseMechanism(): ASTNode {
    const mechanismName = tokens[index++];
    if (mechanismName.type !== "key") {
      throw new Error(`Unexpected token ${mechanismName}`);
    }

    const mechanismNode: ASTNode = { type: mechanismName.value } as any;

    index++; // skip the 'indent' token for mechanisms parameters

    while (index < tokens.length && tokens[index].type !== "outdent") {
      const token = tokens[index++];
      if (token.type === "key") {
        mechanismNode[token.value] = parseExpression();
      } else {
        throw new Error(`Unexpected token ${JSON.stringify(token)}`);
      }
    }

    index++; // Skip the 'outdent' token mechanisms parameters
    index++; // Skip the 'outdent' token for the mechanism itself

    return mechanismNode;
  }

  const parsedProgram = { type: "publicodes", rules: parsedRules } as const;

  return inferRulesUnit(resolveNames(parsedProgram));
}

// XXX on parcourt l'arbre 2 fois avec resolveName et inferRulesUnit, faisable en 1 fois ?

function resolveNames(parsedRules: ASTPublicodesNode) {
  const allParents = (name) =>
    name
      .split(".")
      .reduce((acc, name) => {
        const last = acc[acc.length - 1];
        return [...acc, last ? `${last} . ${name.trim()}` : name.trim()];
      }, [])
      .reverse();

  return walk(
    parsedRules,
    {},
    {
      publicodes(node, { next }) {
        next({ availableNames: node.rules.map((rule) => rule.name) });
      },
      rule: (node, { next, state }) => {
        next({ ...state, parentsNames: allParents(node.name) });
      },
      reference(node, { state: { availableNames, parentsNames } }) {
        const parentName = parentsNames.find((parent) =>
          availableNames.includes(`${parent} . ${node.name}`)
        );
        if (parentName) {
          return {
            type: "reference",
            name: `${parentName} . ${node.name}`,
          };
        }
        if (availableNames.includes(node.name)) {
          return node;
        }

        throw Error(`Unknown reference ${node.name} in ${parentsNames[0]}`);
      },
    }
  );
}

function inferRulesUnit(parsedRules) {
  const inferedUnits = new WeakMap();
  const inferRuleUnit = (ruleNode) => {
    return walk(
      ruleNode,
      { enforceUnitStack: [] },
      {
        rule(node, { visit }) {
          const rewrittenNode = visit(node.value);
          inferedUnits.set(node, inferedUnits.get(rewrittenNode));
          return { ...node, value: rewrittenNode, unit: rewrittenNode.unit };
        },
        reference(node) {
          const associatedRule = parsedRules.rules.find(
            (rule) => rule.name === node.name
          );
          if (!inferedUnits.has(associatedRule)) {
            inferRuleUnit(associatedRule);
          }
          inferedUnits.set(node, inferedUnits.get(associatedRule));
        },
        constant(node) {
          inferedUnits.set(node, node.unit);
        },
        barème(node, { visit }) {
          const assietteUnit = inferedUnits.get(visit(node.assiette));

          const newNode = {
            ...node,
            tranches: node.tranches.map((t) => {
              if (!t.plafond) return t;
              const plafondUnit = inferedUnits.get(visit(t.plafond));
              if (plafondUnit === assietteUnit) return t;
              else {
                return {
                  ...t,
                  plafond: {
                    type: "unitConversion",
                    factor: {
                      type: "constant",
                      value: conversionFactor(assietteUnit, plafondUnit),
                    },
                    value: t.plafond,
                  },
                };
              }
            }),
          };
          inferedUnits.set(newNode, assietteUnit);
          return newNode;
        },
        produit(node, { visit }) {
          const assietteUnit = inferedUnits.get(visit(node.assiette));
          const tauxUnit = inferedUnits.get(visit(node.taux));
          inferedUnits.set(node, inferUnit("*", assietteUnit, tauxUnit));
        },
        operation(node, { visit }) {
          const leftUnit = inferedUnits.get(visit(node.left));
          const rightUnit = inferedUnits.get(visit(node.right));
          if (node.operator === "+" || node.operator === "-") {
            inferedUnits.set(node, leftUnit);

            if (leftUnit !== rightUnit) {
              return {
                ...node,
                right: {
                  type: "unitConversion",
                  factor: {
                    type: "constant",
                    value: conversionFactor(leftUnit, rightUnit),
                  },
                  value: node.right,
                },
              };
            }
          } else {
            const unit = inferUnit(node.operator, leftUnit, rightUnit);
            inferedUnits.set(node, unit);
          }
        },
      }
    );
  };

  return walk(parsedRules, {}, { rule: (node) => inferRuleUnit(node) });
}
