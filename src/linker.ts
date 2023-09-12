import type { ASTNode, ASTPublicodesNode, ASTRuleNode } from "./parser";
import { walk } from "zimmerframe";
import { conversionFactor, inferUnit } from "./units";

type InferedType =
  | { type: "string" | "boolean" }
  | { type: "number"; unit: string };

export function link(parsedRules: ASTPublicodesNode) {
  const inferedUnits = new WeakMap<ASTNode, InferedType>();
  const rewrittenRules = new WeakMap<ASTNode, ASTNode>();
  const availableNames = parsedRules.rules.map((rule) => rule.name);

  function inferRuleUnit(ruleNode: ASTRuleNode) {
    if (rewrittenRules.has(ruleNode)) {
      return rewrittenRules.get(ruleNode);
    }
    return walk(
      ruleNode,
      { enforceUnitStack: [] },
      {
        rule(node, { visit, state }) {
          const allParents = (name) =>
            name
              .split(".")
              .reduce((acc, name) => {
                const last = acc[acc.length - 1];
                return [
                  ...acc,
                  last ? `${last} . ${name.trim()}` : name.trim(),
                ];
              }, [])
              .reverse();

          const rewrittenNode = visit(node.value, {
            ...state,
            parentsNames: allParents(node.name),
          });
          const rewrittenNodeUnit = inferedUnits.get(rewrittenNode);
          inferedUnits.set(node, inferedUnits.get(rewrittenNode));
          const rewrittenRule = {
            ...node,
            value: rewrittenNode,
            unit: rewrittenNodeUnit,
          };
          rewrittenRules.set(node, rewrittenRule);
          return rewrittenRule;
        },
        reference(node, { state: { parentsNames }, path }) {
          const parentName = parentsNames.find((parent) =>
            availableNames.includes(`${parent} . ${node.name}`)
          );
          if (parentName) {
            node.name = `${parentName} . ${node.name}`;
          } else if (availableNames.includes(node.name)) {
          } else {
            throw Error(`Unknown reference ${node.name} in ${parentsNames[0]}`);
          }

          const associatedRule = parsedRules.rules.find(
            (rule) => rule.name === node.name
          );
          if (!inferedUnits.has(associatedRule)) {
            inferRuleUnit(associatedRule);
          }
          inferedUnits.set(node, inferedUnits.get(associatedRule));
          return node;
        },
        constant(node) {
          const type = typeof node.value;
          if (type === "boolean" || type === "string") {
            inferedUnits.set(node, { type });
          } else if (type === "number") {
            inferedUnits.set(node, { type, unit: node.unit });
          } else {
            throw new Error(`Unexpected constant type ${type}`);
          }
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
          let rightUnitConvert = false;
          if (node.operator === "+" || node.operator === "-") {
            inferedUnits.set(node, leftUnit);
            rightUnitConvert = true;
          } else if (node.operator === "*" || node.operator === "/") {
            const unit = inferUnit(node.operator, leftUnit, rightUnit);
            inferedUnits.set(node, unit);
          } else if (
            node.operator === "==" ||
            node.operator === ">=" ||
            node.operator === ">" ||
            node.operator === "<=" ||
            node.operator === "<"
          ) {
            if (leftUnit.type !== rightUnit?.type) {
              throw new Error("Cannot compare different types");
            }
            inferedUnits.set(node, { type: "boolean" });
            rightUnitConvert = true;
          }

          if (rightUnitConvert && leftUnit.unit !== rightUnit.unit) {
            const newNode = {
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
            inferedUnits.set(newNode, inferedUnits.get(node));
            return newNode;
          }
        },
        ["toutes ces conditions"](node) {
          inferedUnits.set(node, { type: "boolean" });
          // TODO ensure all conditions are boolean
        },
        ["une de ces conditions"](node) {
          inferedUnits.set(node, { type: "boolean" });
          // TODO ensure all conditions are boolean
        },
        ["applicable si"](node, { visit }) {
          inferedUnits.set(node, inferedUnits.get(visit(node.value)));
        },
        variations(node, { visit, next }) {
          const firstCondition = visit(node.value[0].si);
          const firstConsequence = node.value[0].alors;
          inferedUnits.set(node, inferedUnits.get(visit(firstConsequence)));
          // ensure all test are boolean, and convert consequences to the same unit
        },
        somme(node, { visit }) {
          const firstTerm = visit(node.value[0]);
          const firstTermUnit = inferedUnits.get(firstTerm);
          inferedUnits.set(node, firstTermUnit);
        },
        plafond(node, { visit }) {
          const unit = inferedUnits.get(visit(node.value));
          inferedUnits.set(node, unit);
        },
        ["par défaut"](node, { visit }) {
          const unit = inferedUnits.get(visit(node["par défaut"]));
          inferedUnits.set(node, unit);
        },
        ["unité"](node) {
          inferedUnits.set(node, { type: "number", unit: node["unité"].value });
          // todo convert
          inferedUnits.set(node.value, {
            type: "number",
            unit: node["unité"].value,
          });
        },
        ["possibilités"](node) {
          inferedUnits.set(node, { type: "string" });
          return node;
        },
      }
    );
  }

  return walk(parsedRules, {}, { rule: (node) => inferRuleUnit(node) });
}
