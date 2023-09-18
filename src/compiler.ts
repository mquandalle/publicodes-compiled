import { walk } from "zimmerframe";
import { builders as b } from "estree-toolkit";
import { generate } from "astring";
import { type ASTPublicodesNode } from "./parser";

export function compile(parsedPublicodes: ASTPublicodesNode) {
  const state = { injectedRuntime: new Set() };
  const esTree = walk(parsedPublicodes, state, {
    publicodes(node, { visit }) {
      return b.objectExpression(
        node.rules.map((ruleNode) =>
          b.property("init", b.literal(ruleNode.name), visit(ruleNode))
        )
      );
    },

    rule(node, { visit }) {
      return b.arrowFunctionExpression([b.identifier("r")], visit(node.value));
    },

    constant(node) {
      return b.literal(node.value);
    },

    reference(node) {
      return b.callExpression(b.identifier("r"), [b.literal(node.name)]);
    },

    operation(node, { visit }) {
      return b.binaryExpression(
        node.operator,
        visit(node.left),
        visit(node.right)
      );
    },

    undefined() {
      return b.identifier("undefined");
    },

    produit(node, { visit }) {
      return visit({
        type: "operation",
        operator: "*",
        left: node.assiette,
        right: node.taux,
      });
    },

    unitConversion(node, { visit }) {
      return visit({
        type: "operation",
        operator: "*",
        left: node.factor,
        right: node.value,
      });
    },

    barème(node, { state, visit }) {
      state.injectedRuntime.add(
        "const evalBareme = (a, t) => t.map((u, i) => ((Math.max(Math.min(a, u.plafond ?? Infinity) - (t[i - 1]?.plafond ?? 0), 0)) * u.taux)).reduce((a, b) => a + b, 0);"
      );
      return b.callExpression(b.identifier("evalBareme"), [
        visit(node.assiette),
        b.arrayExpression(
          node.tranches.map((t) =>
            b.objectExpression(
              ["taux", t.plafond && "plafond"]
                .filter(Boolean)
                .map((attr) =>
                  b.property("init", b.identifier(attr), visit(t[attr]))
                )
            )
          )
        ),
      ]);
    },

    ["une de ces conditions"](node, { visit }) {
      let res = visit(node.value[0]);
      for (let i = 1; i < node.value.length; i++) {
        res = b.logicalExpression("||", res, visit(node.value[i]));
      }
      return res;
    },

    ["toutes ces conditions"](node, { visit }) {
      let res = visit(node.value[0]);
      for (let i = 1; i < node.value.length; i++) {
        res = b.logicalExpression("&&", res, visit(node.value[i]));
      }
      return res;
    },

    variations(node, { visit }) {
      return b.conditionalExpression(
        visit(node.value[0].si),
        visit(node.value[0].alors),
        visit(node.value[1].sinon)
      );
    },

    ["applicable si"](node, { visit }) {
      return b.conditionalExpression(
        visit(node["applicable si"]),
        visit(node["value"]),
        b.identifier("null")
      );
    },
  });

  const jsCodeRules = generate(esTree);
  const injectedRuntime = Array.from(state.injectedRuntime).join(";\n");
  return `(() => {${injectedRuntime}\nreturn ${jsCodeRules}})`;
}
