export type Token =
  | { type: "constant"; value: number; unit?: string }
  | { type: "boolean"; value: boolean }
  | { type: "text"; value: string }
  | { type: "operator"; value: string }
  | { type: "reference"; value: string }
  | { type: "paren-open" }
  | { type: "paren-close" }
  | { type: "indent" }
  | { type: "outdent" }
  | { type: "list-item" }
  | { type: "key"; value: string };

const ruleNameRegex = /\p{L}([\p{L}\x20\.']*\p{L})?/uy;
const booleanRegex = /(oui|non)/y;
const numberRegex = /[0-9]+(\.[0-9]+)?/y;
const unitRegex = /[a-z€]+(\/[a-z€]+)?/y;
const infixOperatorRegex = /(<=|>=|<|>|=|\+|\-|\*|\/)/y;
const commentRegex = /#.*/y;
const spaceRegex = /\x20+/y;
const startMultiLineStringRegex = /\x20*\|\x20*\n/y;

export function tokenize(source: string): Token[] {
  let tokens: Token[] = [];
  let currentIndent = 0;
  let indentStack: number[] = [];
  let cursor = 0;

  function matchRegex(regex: RegExp): string | undefined {
    regex.lastIndex = cursor;
    const matched = regex.exec(source);
    if (matched) {
      cursor += matched[0].length;
      return matched[0];
    }
  }
  function matchSingleChar<const C extends string>(char: C): C | undefined {
    const matched = source[cursor] === char;
    if (matched) {
      cursor++;
      return char;
    }
  }

  while (cursor < source.length) {
    if (cursor === 0 || matchSingleChar("\n")) {
      const spaces = matchRegex(spaceRegex);
      let indent = spaces ? spaces.length : 0;
      if (matchSingleChar("-")) {
        indent++;
        const spaces = matchRegex(spaceRegex);
        if (spaces) indent += spaces.length;

        tokens.push({ type: "list-item" });
        indentStack.push(currentIndent);
        currentIndent = indent;
      } else if (indent > currentIndent) {
        tokens.push({ type: "indent" });
        indentStack.push(currentIndent);
        currentIndent = indent;
      } else {
        while (indent < currentIndent) {
          tokens.push({ type: "outdent" });
          currentIndent = indentStack.pop() || 0;
        }
      }
      if (cursor > 0) {
        continue;
      }
    }

    if (matchRegex(spaceRegex) || matchRegex(commentRegex)) {
      continue;
    }

    const operatorToken = matchRegex(infixOperatorRegex);
    if (operatorToken) {
      tokens.push({ type: "operator", value: operatorToken[0] });
      continue;
    }

    if (matchSingleChar("(")) {
      tokens.push({ type: "paren-open" });
      continue;
    }

    if (matchSingleChar(")")) {
      tokens.push({ type: "paren-close" });
      continue;
    }

    const booleanToken = matchRegex(booleanRegex);
    if (booleanToken) {
      tokens.push({ type: "boolean", value: booleanToken === "oui" });
      continue;
    }

    let quoteType = matchSingleChar('"') || matchSingleChar("'");
    if (quoteType) {
      let value = "";
      let legacyDuplicatedQuotes = false;

      const invertQuote = (q: '"' | "'") => (q === '"' ? "'" : '"');
      if (matchSingleChar(invertQuote(quoteType))) {
        legacyDuplicatedQuotes = true;
        quoteType = invertQuote(quoteType);
      }

      for (; cursor < source.length; cursor++) {
        if (source[cursor] === "\\") {
          value += source[++cursor];
          continue;
        } else if (source[cursor] === quoteType) {
          tokens.push({ type: "text", value });
          cursor++;

          if (legacyDuplicatedQuotes) {
            if (!matchSingleChar(invertQuote(quoteType))) {
              throw new Error("Unterminated legacy string");
            }
          }
          break;
        }

        value += source[cursor];
      }

      if (cursor > source.length) {
        throw new Error("Unterminated string");
      }

      continue;
    }
    const refToken = matchRegex(ruleNameRegex);
    if (refToken) {
      matchRegex(spaceRegex);
      if (matchSingleChar(":")) {
        tokens.push({ type: "key", value: refToken });
        if (matchRegex(startMultiLineStringRegex)) {
          multiLineString();
        }
      } else {
        tokens.push({ type: "reference", value: refToken });
      }
      continue;
    }

    const numberToken = matchRegex(numberRegex);
    if (numberToken) {
      matchRegex(spaceRegex);
      const unit = matchRegex(unitRegex);
      const percentage = matchSingleChar("%");
      const value = parseFloat(numberToken);
      if (unit) {
        tokens.push({ type: "constant", value, unit: unit });
      } else if (percentage) {
        tokens.push({ type: "constant", value: value / 100 });
      } else {
        tokens.push({ type: "constant", value });
      }
      continue;
    }

    throw new Error(`Cannot tokenize`);
  }

  function multiLineString() {
    const endMultiLineString = RegExp(
      "(.+?)\\n\\x20{" + currentIndent + "}([^\\x20\\n]|$)",
      "ys"
    );
    endMultiLineString.lastIndex = cursor;
    const multilineString = endMultiLineString.exec(source);

    if (!multilineString) {
      throw new Error("Unterminated multi-line string");
    }
    const length = multilineString[1].length;
    const value = source
      .slice(cursor, cursor + length)
      .replace(/(^|\n)\x20*/g, "$1");
    cursor += multilineString[1].length;
    tokens.push({ type: "text", value });
  }

  return tokens;
}

export function printTokens(tokens: Token[], { lineNumbers = false } = {}) {
  return tokens
    .map(
      (t, i) =>
        `${lineNumbers ? i.toString().padEnd(5, " ") : ""}${t.type}${
          "value" in t ? `(${t.value})` : ""
        }${Object.keys(t)
          .filter((k) => k !== "type" && k !== "value")
          .map((k) => ` [${k}: ${t[k]}]`)}`
    )
    .join("\n");
}
