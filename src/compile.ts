import { walk } from "zimmerframe";
import { builders as b } from "estree-toolkit";
import { generate } from "astring";
import { type ASTNode } from "./parse";

const injectedRuntime = `
const evalBareme = (a, t) => t.map((u, i) => ((Math.max(Math.min(a, u.plafond ?? Infinity) - (t[i - 1]?.plafond ?? 0), 0)) * u.taux)).reduce((a, b) => a + b, 0);
`;

export function compile(rules: Record<string, ASTNode>) {
  const esTree = b.objectExpression(
    Object.entries(rules).map(([ruleName, node]) =>
      b.property(
        "init",
        b.literal(ruleName),
        wrapInContextFunction(publicodesASTtoESTree(node))
      )
    )
  );
  return wrapRuntime(generate(esTree));
}

const publicodesASTtoESTree = (ast: ASTNode) =>
  walk(ast, null, {
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

    produit(node, { visit }) {
      return visit({
        type: "operation",
        operator: "*",
        left: node.assiette,
        right: node.taux,
      });
    },

    barème(node, { visit }) {
      return b.callExpression(b.identifier("evalBareme"), [
        visit(node.assiette),
        b.arrayExpression(
          node.tranches.map((t) =>
            b.objectExpression(
              [
                b.property("init", b.identifier("taux"), visit(t.taux)),

                t.plafond
                  ? b.property(
                      "init",
                      b.identifier("plafond"),
                      visit(t.plafond)
                    )
                  : null,
              ].filter(Boolean)
            )
          )
        ),
      ]);
    },
  });

const wrapRuntime = (jsCodeRules) =>
  `(() => {${injectedRuntime}return ${jsCodeRules}})()`;

const wrapInContextFunction = (ast) =>
  b.arrowFunctionExpression([b.identifier("r")], ast);
