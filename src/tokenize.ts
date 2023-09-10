import { keysWithExpression } from "./parse";

export type Token =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "text"; value: string }
  | { type: "operator"; value: string }
  | { type: "reference"; value: string }
  | { type: "unit"; value: string }
  | { type: "key"; value: string }
  | { type: "paren-open" }
  | { type: "paren-close" }
  | { type: "indent" }
  | { type: "outdent" }
  | { type: "list-item" };

const ruleNameRegex = /[\p{L}$](([$\p{L}\x20\.'0-9]|\S-\S)*[\p{L}$0-9])?/uy;
const booleanRegex = /(oui|non)/y;
const numberRegex = /[0-9]+(\.[0-9]+)?/y;
const unitRegex = /[a-z€]+(\/[a-z€]+)?/y;
const infixOperatorRegex = /(<=|>=|<|>|=|\+|\-|\*|\/)/y;
const endOfLine = /.*/y;
const spaceRegex = /\x20+/y;
const startMultiLineStringRegex = /\x20*\|\x20*\n/y;

type TokenWithLoc = Token & { start?: number; end?: number };

export function tokenize(
  source: string,
  { withLoc = false } = {}
): TokenWithLoc[] {
  let tokens: Token[] = [];
  let currentIndent = 0;
  let indentStack: number[] = [];
  let isListStack: boolean[] = [];
  let cursor = 0;
  let prevCursorPos = 0;

  function matchRegex(regex: RegExp): string | undefined {
    regex.lastIndex = cursor;
    const matched = regex.exec(source);
    if (matched) {
      if (withLoc) {
        prevCursorPos = cursor;
      }
      cursor += matched[0].length;
      return matched[0];
    }
  }
  function matchSingleChar<const C extends string>(char: C): C | undefined {
    const matched = source[cursor] === char;
    if (matched) {
      if (withLoc) {
        prevCursorPos = cursor;
      }
      cursor++;
      return char;
    }
  }
  function push(token: Token) {
    if (withLoc) {
      tokens.push({ ...token, start: prevCursorPos, end: cursor });
    } else {
      tokens.push(token);
    }
  }

  while (cursor < source.length) {
    if (cursor === 0 || matchSingleChar("\n")) {
      const spaces = matchRegex(spaceRegex);
      let indent = spaces ? spaces.length : 0;
      if (matchSingleChar("-")) {
        indent++;
        const spaces = matchRegex(spaceRegex);
        indent += spaces ? spaces.length : 0;

        if (indent > currentIndent) {
          indentStack.push(currentIndent);
          isListStack.push(true);
          currentIndent = indent;
        }
        push({ type: "list-item" });
      } else if (indent > currentIndent) {
        push({ type: "indent" });
        indentStack.push(currentIndent);
        isListStack.push(false);
        currentIndent = indent;
      } else {
        while (indent < currentIndent) {
          if (!isListStack.pop()) {
            push({ type: "outdent" });
          }
          currentIndent = indentStack.pop() || 0;
        }
      }
      if (cursor > 0) {
        continue;
      }
    }

    if (matchSingleChar("#")) {
      matchRegex(endOfLine);
      continue;
    }

    if (matchRegex(spaceRegex)) {
      continue;
    }

    const operatorToken = matchRegex(infixOperatorRegex);
    if (operatorToken) {
      push({ type: "operator", value: operatorToken });
      continue;
    }

    if (matchSingleChar("(")) {
      push({ type: "paren-open" });
      continue;
    }

    if (matchSingleChar(")")) {
      push({ type: "paren-close" });
      continue;
    }

    const booleanToken = matchRegex(booleanRegex);
    if (booleanToken) {
      push({ type: "boolean", value: booleanToken === "oui" });
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
          push({ type: "text", value });
          if (withLoc) {
            tokens[tokens.length - 1].end += 1;
          }
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
        push({ type: "key", value: refToken });
        isListStack[isListStack.length - 1] = false;
        if (matchRegex(startMultiLineStringRegex)) {
          multiLineString();
        } else if (refToken === "unité") {
          matchRegex(spaceRegex);
          const unit = matchRegex(unitRegex);
          if (unit) {
            push({ type: "unit", value: unit });
          } else {
            throw new Error("Missing unit");
          }
        } else if (
          !keysWithExpression.has(refToken) &&
          indentStack.length > 0
        ) {
          matchRegex(spaceRegex);
          const text = matchRegex(endOfLine);
          if (text) {
            push({ type: "text", value: text });
          }
        }
      } else {
        push({ type: "reference", value: refToken });
      }
      continue;
    }

    const numberToken = matchRegex(numberRegex);
    if (numberToken) {
      matchRegex(spaceRegex);
      const percentage = matchSingleChar("%");
      const value = parseFloat(numberToken);
      if (percentage) {
        push({ type: "number", value: value / 100 });
      } else {
        push({ type: "number", value });
      }
      const unit = matchRegex(unitRegex);
      if (unit) {
        push({ type: "unit", value: unit });
      }
      continue;
    }
    throw new Error(`Cannot tokenize`);
  }

  function multiLineString() {
    const endMultiLineString = RegExp(
      "(.+?)\\n\\x20{0," + currentIndent + "}([^\\x20\\n]|$)",
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
      .replace(/(^|\n)\x20*/g, "\n")
      .trim();
    cursor += multilineString[1].length;
    push({ type: "text", value });
  }

  return tokens;
}

export function printTokens(tokens: Token[], { lineNumbers = false } = {}) {
  return tokens
    .map(
      (t, i) =>
        `${
          lineNumbers
            ? i.toString().padEnd(tokens.length.toString().length + 1, " ")
            : ""
        }${t.type}${"value" in t ? `(${t.value})` : ""}`
    )
    .join("\n");
}
