import type { ASTNode } from "./parse";
import { walk } from "zimmerframe";

function conversionFactor(from: InferedType, to: InferedType) {
  if (from.type !== "number" || to.type !== "number") {
    throw new Error("Incorrect conversion");
  }
  const conversationTable = {
    "mois => an": 12,
    "an => mois": 1 / 12,
    "€/an => €/mois": 12,
    "€/mois => €/an": 1 / 12,
  };
  if (conversationTable[`${from.unit} => ${to.unit}`]) {
    return conversationTable[`${from.unit} => ${to.unit}`];
  }
  throw new Error(
    `Conversion factor from ${from.unit} to ${to.unit} is not implemented`
  );
}

function inferUnit(
  operator: "*" | "/",
  left: InferedType,
  right: InferedType
): InferedType {
  if (left.type !== "number" || right.type !== "number") {
    throw new Error("Incorrect units");
  }
  if (operator === "*" && left.unit === undefined)
    return { type: "number", unit: right.unit };
  if (operator === "*" && right.unit === undefined)
    return { type: "number", unit: left.unit };
  throw new Error("Not implemented");
}

type InferedType =
  | { type: "string" | "boolean" }
  | { type: "number"; unit: string };

export function inferNodeTypes(parsedRules) {
  const inferedUnits = new WeakMap<ASTNode, InferedType>();
  const rewrittenRules = new WeakMap<ASTNode, ASTNode>();

  const inferRuleUnit = (ruleNode) => {
    if (rewrittenRules.has(ruleNode)) {
      return rewrittenRules.get(ruleNode);
    }
    return walk(
      ruleNode,
      { enforceUnitStack: [] },
      {
        rule(node, { visit }) {
          const rewrittenNode = visit(node.value);
          inferedUnits.set(node, inferedUnits.get(rewrittenNode));
          const rewrittenRule = {
            ...node,
            value: rewrittenNode,
            unit: rewrittenNode.unit,
          };
          rewrittenRules.set(node, rewrittenRule);
          return rewrittenRule;
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
        },
      }
    );
  };

  return walk(parsedRules, {}, { rule: (node) => inferRuleUnit(node) });
}
