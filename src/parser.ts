import { tokenize, type Token } from "./tokenizer";
import { link } from "./linker";

const mechanismSignatures = {
  "une de ces conditions": [],
  "toutes ces conditions": [],
  variations: [],
  plafond: [],
  "applicable si": [],
  somme: [],
  unité: [],
  "par défaut": [],
  valeur: [],
  produit: [],
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

const chainableMecanisms = [
  "par défaut",
  "unité",
  "applicable si",
  "plancher",
  "plafond",
];

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

export function parse(
  source: string,
  { withLoc = false, availableRules = [] } = {}
): ASTPublicodesNode {
  const tokens: Token[] = tokenize(source, { withLoc });
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
    const keyToken = tokens[index++];
    const ruleName = keyToken.value;
    // a new rule, this one is empty
    if (index >= tokens.length || tokens[index]?.type === "key") {
      parsedRules.push({
        type: "rule",
        name: ruleName,
        value: { type: "undefined" },
      });
    } else {
      currentRuleNode = { type: "rule", name: ruleName };
      currentRuleNode.value = parseExpression();
      if (withLoc) {
        currentRuleNode.start = keyToken.start;
        currentRuleNode.end = currentRuleNode.value.end;
      }
      parsedRules.push(currentRuleNode);
    }
  }

  function parseExpression() {
    if (tokens[index]?.type === "indent") {
      index++; // skip the 'indent' token
      const node =
        tokens[index]?.type === "list-item" ? parseList() : parseRecord();
      if (tokens[index]?.type === "outdent") {
        index++;
      }
      return node;
    }
    return parseInlineExpression();
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
    let start = tokens[index].start,
      end = tokens[index].end;
    while (index < tokens.length && tokens[index].type === "key") {
      end = tokens[index].end;
      const key = tokens[index++].value;
      if (textFields.includes(key)) {
        const nextToken = tokens[index];
        if (
          nextToken.type === "text" ||
          nextToken.type === "reference" ||
          nextToken.type === "number"
        ) {
          currentRuleNode[key] = nextToken.value;
          index++;
        } else if (nextToken.type === "key") {
          currentRuleNode[key] = "";
        } else if (nextToken.type === "indent") {
          currentRuleNode[key] = parseExpression();
        } else {
          throw new Error(`Unexpected token ${JSON.stringify(tokens[index])}`);
        }
      } else {
        if (key === "unité") {
          entries.push([key, tokens[index++]]);
        } else {
          entries.push([key, parseExpression()]);
        }
      }
    }
    if (entries.length === 0) {
      throw new Error(`Unexpected token ${JSON.stringify(tokens[index])}`);
    }
    if (
      index < tokens.length &&
      tokens[index].type !== "outdent" &&
      tokens[index].type !== "list-item"
    ) {
      throw new Error(`Expected token at ${index}`);
    }

    let node;

    const mechanismsEntries = entries.filter(([key]) =>
      mechanismNames.includes(key)
    );
    if (mechanismsEntries.length !== entries.length) {
      node = { ...Object.fromEntries(entries), type: "record" };
      if (withLoc) {
        node.start = start;
        node.end = end;
      }
      return node;
    }
    const nonChainableMechanism = mechanismsEntries.filter(
      ([key]) => !chainableMecanisms.includes(key)
    );
    const chainableMechanisms = mechanismsEntries.filter(([key]) =>
      chainableMecanisms.includes(key)
    );

    if (nonChainableMechanism.length > 1) {
      throw new Error(`Unexpected token ${JSON.stringify(tokens[index])}`);
    }

    const mechanismName = nonChainableMechanism[0]?.[0];
    const value = nonChainableMechanism[0]?.[1];
    const mechanismKeys = mechanismSignatures[mechanismName];
    if (!mechanismName) {
      node = { type: "constant", value: undefined };
    } else if (mechanismName === "valeur") {
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

    if (withLoc) {
      return { ...node, start, end };
    }
    return node;
  }

  function parseInlineExpression(): ASTNode {
    return parseComparison();
  }

  function parseComparison(): ASTNode {
    let node = parseAdditionSubstration();
    let start = node.start;
    let end = node.end;

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
      end = right.end;
      node = {
        type: "operation",
        operator: token.value === "=" ? "==" : token.value,
        left: node,
        right,
      };
    }
    if (withLoc) {
      return { ...node, start, end };
    }
    return node;
  }

  function parseAdditionSubstration(): ASTNode {
    let node = parseMultiplicationDivision();
    let start = node.start;
    let end = node.end;

    while (index < tokens.length) {
      const token = tokens[index];
      if (
        token.type === "operator" &&
        (token.value === "+" || token.value === "-")
      ) {
        index++;
        const right = parseMultiplicationDivision();
        end = right.end;
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
    if (withLoc) {
      return { ...node, start, end };
    }
    return node;
  }

  function parseMultiplicationDivision(): ASTNode {
    let node = parseParenthesizedExpression();
    let start = node.start;
    let end = node.end;

    while (index < tokens.length) {
      const token = tokens[index];
      if (
        token.type === "operator" &&
        (token.value === "*" || token.value === "/")
      ) {
        index++;
        const right = parseParenthesizedExpression();
        end = right.end;
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
    if (withLoc) {
      return { ...node, start, end };
    }
    return node;
  }

  function parseParenthesizedExpression(): ASTNode {
    if (tokens[index].type === "paren-open") {
      let start = tokens[index].start;
      index++;
      const node = parseInlineExpression();
      let end = tokens[index].end;
      if (tokens[index++].type !== "paren-close") {
        throw new Error(`Unexpected token ${JSON.stringify(tokens[index])}`);
      }
      if (withLoc) {
        return { ...node, start, end };
      }
      return node;
    }
    return parseTerminalNode();
  }

  function parseTerminalNode(): ASTNode {
    const token = tokens[index++];
    let node;
    let start = token.start;
    let end = token.end;
    if (token.type === "number") {
      if (tokens[index]?.type === "unit") {
        end = tokens[index].end;
        node = {
          type: "constant",
          value: token.value,
          unit: tokens[index++].value,
        };
      } else {
        node = { type: "constant", value: token.value, unit: "" };
      }
    } else if (token.type === "reference") {
      node = { type: "reference", name: token.value };
    } else if (token.type === "text") {
      node = { type: "constant", value: token.value };
    } else if (token.type === "boolean") {
      node = { type: "constant", value: token.value };
    } else {
      throw new Error(
        `Unexpected token ${JSON.stringify(token)} at ${index - 1}`
      );
    }

    if (withLoc) {
      return { ...node, start, end };
    } else {
      return node;
    }
  }

  const parsedProgram = { type: "publicodes", rules: parsedRules } as const;

  if (withLoc) {
    parsedProgram.start = parsedRules[0].start;
    parsedProgram.end = parsedRules[parsedRules.length - 1].end;
  }

  // return parsedProgram;
  return link(parsedProgram, availableRules);
}

export function parseJsObject(jsObj, options) {
  // HACK
  return parse(
    Object.entries(jsObj)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
    options
  );
}
