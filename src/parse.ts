import { tokenize, type Token } from "./tokenize";
import { walk } from "zimmerframe";
import { inferNodeTypes } from "./units";

export type ASTNode =
  | { type: "constant"; value: boolean | number | string; unit?: string }
  | { type: "undefined" }
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
              type: "undefined",
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
    return parseComparison();
  }

  function parseComparison(): ASTNode {
    let node = parseAdditionSubstration();

    let token = tokens[index];
    if (
      token &&
      token.type === "operator" &&
      (token.value === "=" ||
        token.value === ">=" ||
        token.value === ">" ||
        token.value === "<" ||
        token.value === "<=")
    ) {
      index++;
      const right = parseAdditionSubstration();
      node = {
        type: "operation",
        operator: token.value === "=" ? "==" : token.value,
        left: node,
        right,
      };
    }
    return node;
  }

  function parseAdditionSubstration(): ASTNode {
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
    } else if (token.type === "text") {
      return { type: "constant", value: token.value };
    } else if (token.type === "boolean") {
      return { type: "constant", value: token.value };
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

  // XXX on parcourt l'arbre 2 fois avec resolveName et inferNodeTypes, faisable en 1 fois ?
  return inferNodeTypes(resolveNames(parsedProgram));
}

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
