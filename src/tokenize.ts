export type Token =
  | { type: "constant"; value: number; unit?: string }
  | { type: "operator"; value: string }
  | { type: "reference"; value: string }
  | { type: "indent" }
  | { type: "outdent" }
  | { type: "list-item" }
  | { type: "key"; value: string };

const ruleRegexStr = "[\\p{L}\\s\\.']+";
const refRegex = new RegExp("^" + ruleRegexStr, "u");
const keyRegexStr = new RegExp("^" + ruleRegexStr + ":", "u");
const numberRegex = /^[0-9]+(\.[0-9]+)?/;
const unitRegex = /^\s*([a-z€]+(\/[a-z€]+)?)/;

export function tokenize(source: string): Token[] {
  const lines = source.split("\n");
  let tokens: Token[] = [];
  let currentIndent = 0;
  let indentStack: number[] = [];

  for (const line of lines) {
    let indent = 0;
    let cursor = 0;

    while (line[indent] === " ") indent++;
    if (line[indent] === "-") {
      indent++;
      while (line[indent] === " ") indent++;
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

    cursor += indent;

    while (cursor < line.length) {
      let remainingLine = line.slice(cursor);

      const spaceToken = remainingLine.match(/^\s+/);
      if (spaceToken) {
        cursor += spaceToken[0].length;
        continue;
      }

      if (remainingLine.match(/^#/)) {
        break;
      }

      if (remainingLine.match(/^[\+\-\*\/]/)) {
        tokens.push({ type: "operator", value: remainingLine[0] });
        cursor++;
        continue;
      }

      const keyToken = remainingLine.match(keyRegexStr);
      if (keyToken) {
        tokens.push({ type: "key", value: keyToken[0].slice(0, -1) });
        cursor += keyToken[0].length;
        continue;
      }

      const numberToken = remainingLine.match(numberRegex);
      if (numberToken) {
        remainingLine = remainingLine.slice(numberToken[0].length);
        const unit = remainingLine.match(unitRegex);
        const percentage = remainingLine.match(/^\s*%/);
        const value = parseFloat(numberToken[0]);
        if (unit) {
          tokens.push({ type: "constant", value, unit: unit[1] });
          cursor += numberToken[0].length + unit[0].length;
        } else if (percentage) {
          tokens.push({ type: "constant", value: value / 100 });
          cursor += numberToken[0].length + percentage[0].length;
        } else {
          tokens.push({ type: "constant", value });
          cursor += numberToken[0].length;
        }
        continue;
      }

      const refToken = remainingLine.match(refRegex);
      if (refToken) {
        tokens.push({ type: "reference", value: refToken[0].trim() });
        cursor += refToken[0].length;
        continue;
      }

      throw new Error(`Cannot tokenize : "${remainingLine}"`);
    }
  }

  return tokens;
}
