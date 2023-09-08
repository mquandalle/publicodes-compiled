import { tokenize, type Token } from "./tokenize";
import { link } from "./link";

const mechanismSignatures = {
  "une de ces conditions": [],
  "toutes ces conditions": [],
  variations: [],
  plafond: [],
  "applicable si": [],
  somme: [],
  valeur: [],
  produit: ["assiette", "taux"],
  barème: ["assiette", "tranches"],
};

const mechanismNames = Object.keys(mechanismSignatures);

export const keysWithExpression = new Set([
  ...mechanismNames,
  ...Object.values(mechanismSignatures).flat(),
  ..."abattement, si, alors, sinon, applicable si, assiette, avec, commune, grille, intercommunalité, nom, non applicable si, par défaut, par, plafond, plancher, possibilités, produit, règle, remplace, rend non applicable, sauf dans, somme, taux, toutes ces conditions, tranches, une de ces conditions, unité, valeur, variations".split(
    ", "
  ),
]);

const chainableMecanisms = ["applicable si", "plancher", "plafond"];

const textFields = [
  "description",
  "titre",
  "remplace",
  "lien",
  "type",
  "question",
  "nom",
];

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
      console.log(currentToken);
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
    return list;
  }

  function parseRecord() {
    const entries = [];
    while (index < tokens.length && tokens[index].type === "key") {
      const key = tokens[index++].value;
      if (textFields.includes(key)) {
        // TODO ensure the token is a string
        currentRuleNode[key] = tokens[index++].value;
      } else {
        entries.push([key, parseExpression()]);
      }
    }
    if (
      index < tokens.length &&
      tokens[index].type !== "outdent" &&
      tokens[index].type !== "list-item"
    ) {
      throw new Error(`Expected token at ${index}`);
    }
    if (index < tokens.length && tokens[index].type === "outdent") {
      index++;
    }

    if (entries.length === 0) {
      throw new Error(`Unexpected token ${JSON.stringify(tokens[index])}`);
    }

    const mechanismsEntries = entries.filter(([key]) =>
      mechanismNames.includes(key)
    );
    if (mechanismsEntries.length !== entries.length) {
      return { ...Object.fromEntries(entries), type: "record" };
    }
    const nonChainableMechanism = mechanismsEntries.filter(
      ([key]) => !chainableMecanisms.includes(key)
    );
    const chainableMechanisms = mechanismsEntries.filter(([key]) =>
      chainableMecanisms.includes(key)
    );

    if (nonChainableMechanism.length !== 1) {
      console.log(parsedRules);
      throw new Error(`Unexpected token ${JSON.stringify(tokens[index])}`);
    }

    let node;
    const currentMechanism = nonChainableMechanism[0];
    const mechanismName = currentMechanism[0];
    const mechanismKeys = mechanismSignatures[mechanismName];
    const value = nonChainableMechanism[0][1];
    if (mechanismName === "valeur") {
      node = value;
    } else if (mechanismKeys.length === 0) {
      node = { type: mechanismName, value };
    } else {
      node = { ...value, type: mechanismName };
    }
    for (let chainableMechanism of chainableMechanisms) {
      const mechanismName = chainableMechanism[0];
      node = {
        type: mechanismName,
        [mechanismName]: chainableMechanism[1],
        value: node,
      };
    }
    return node;
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
      if (tokens[index]?.type === "unit") {
        return {
          type: "constant",
          value: token.value,
          unit: tokens[index++].value,
        };
      }
      return { type: "constant", value: token.value, unit: "" };
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

  // return parsedProgram;
  return link(parsedProgram);
}
