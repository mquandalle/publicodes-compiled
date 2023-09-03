import { tokenize, type Token } from "./tokenize";
import { walk } from "zimmerframe";

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

export function parse(source): Record<string, ASTNode> {
  const tokens: Token[] = tokenize(source);
  const parsedRules = {};
  let index = 0;

  while (index < tokens.length) {
    const currentToken = tokens[index];
    if (currentToken.type === "outdent") {
      index++;
      continue;
    } else if (currentToken.type === "key") {
      index++;
      const ruleName = currentToken.value;

      if (tokens[index]?.type === "key") {
        parsedRules[ruleName] = {
          type: "constant",
          value: "undefined",
        };
        continue;
      }

      parsedRules[ruleName] = parseExpression();
    } else {
      console.log(currentToken, index);
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
    if (index < tokens.length && tokens[index].type === "outdent") {
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

  return resolveNames(parsedRules);
}

function resolveNames(parsedRules) {
  const availableNames = Object.keys(parsedRules);
  const allParents = (name) =>
    name
      .split(".")
      .reduce((acc, name) => {
        const last = acc[acc.length - 1];
        return [...acc, last ? `${last} . ${name.trim()}` : name.trim()];
      }, [])
      .reverse();
  return Object.fromEntries(
    Object.entries(parsedRules).map(([name, node]) => {
      return [
        name,
        walk(node, null, {
          reference(node) {
            const parentName = allParents(name).find((parent) =>
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

            throw Error(`Unknown reference ${node.name} in ${name}`);
          },
        }),
      ];
    })
  );
}
