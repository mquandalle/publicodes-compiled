import { tokenize, type Token } from "./tokenize";
import { link } from "./link";

const mechanismSignatures = {
  "une de ces conditions": [],
  "toutes ces conditions": [],
  variations: [],
  produit: ["assiette", "taux"],
  barème: ["assiette", "tranches"],
};

const mechanismNames = Object.keys(mechanismSignatures);

const textFields = ["description", "titre"];

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

export type ASTRuleNode = { type: "rule"; name: string; value: ASTNode };

export type ASTPublicodesNode = {
  type: "publicodes";
  rules: Array<ASTRuleNode>;
};

export function parse(source: string): ASTPublicodesNode {
  const tokens: Token[] = tokenize(source);
  const parsedRules: ASTRuleNode[] = [];
  let currentRuleNode;
  let index = 0;

  while (index < tokens.length) {
    const currentToken = tokens[index];
    if (currentToken.type === "outdent") {
      index++;
      continue;
    } else if (currentToken.type === "key") {
      parseRule();
    } else {
      throw new Error(`Unexpected token ${currentToken.type}`);
    }
  }

  function parseRule() {
    const ruleName = tokens[index++].value;
    // a new rule, this one is empty
    if (tokens[index]?.type === "key") {
      parsedRules.push({
        type: "rule",
        name: ruleName,
        value: { type: "undefined" },
      });
    } else {
      currentRuleNode = { type: "rule", name: ruleName };
      currentRuleNode.value = parseExpression();
      parsedRules.push(currentRuleNode);
    }
  }

  function parseExpression() {
    switch (tokens[index]?.type) {
      case "indent":
        index++; // skip the 'indent' token
        return parseRecord();
      case "key":
        index++;
        return parseExpression();
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
    const entries = [];
    let ok = false;
    while (index < tokens.length && tokens[index].type === "key") {
      const key = tokens[index++].value;
      if (key === "barème") ok = true;
      if (textFields.includes(key)) {
        // TODO ensure the token is a string
        currentRuleNode[key] = tokens[index++].value;
      } else {
        entries.push([key, parseExpression()]);
      }
    }
    if (tokens[index].type === "outdent") {
      index++;
    }

    if (entries.length === 0) {
      throw new Error(`Unexpected token ${JSON.stringify(tokens[index])}`);
    }

    const mechanismsEntries = entries.filter(([key]) =>
      mechanismNames.includes(key)
    );

    if (mechanismsEntries.length > 1) {
      throw new Error(`chainable mechanisms not yet implemented`);
    }

    if (mechanismsEntries.length === 1) {
      const mechanismName = mechanismsEntries[0][0];
      const mechanismKeys = mechanismSignatures[mechanismName];
      const value = mechanismsEntries[0][1];
      if (mechanismKeys.length === 0) {
        return { type: mechanismName, value };
      } else {
        return { ...value, type: mechanismName };
      }
    } else {
      return { ...Object.fromEntries(entries), type: "record" };
    }
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
    let node = parseMultiplicationDivision();

    while (index < tokens.length) {
      const token = tokens[index];
      if (
        token.type === "operator" &&
        (token.value === "+" || token.value === "-")
      ) {
        index++;
        const right = parseMultiplicationDivision();
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

  function parseMultiplicationDivision(): ASTNode {
    let node = parseParenthesizedExpression();

    while (index < tokens.length) {
      const token = tokens[index];
      if (
        token.type === "operator" &&
        (token.value === "*" || token.value === "/")
      ) {
        index++;
        const right = parseParenthesizedExpression();
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

  function parseParenthesizedExpression(): ASTNode {
    if (tokens[index].type === "paren-open") {
      index++;
      const node = parseInlineExpression();
      if (tokens[index++].type !== "paren-close") {
        throw new Error(`Unexpected token ${JSON.stringify(tokens[index])}`);
      }
      return node;
    }
    return parseTerminalNode();
  }

  function parseTerminalNode(): ASTNode {
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

  const parsedProgram = { type: "publicodes", rules: parsedRules } as const;

  return link(parsedProgram);
}
