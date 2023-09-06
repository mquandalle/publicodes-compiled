import { expect, test } from "bun:test";
import { tokenize, printTokens } from "../src/tokenize";

const snap = (intput: string) => printTokens(tokenize(intput));

test("Tokenize", () => {
  const canonicalStringDeclaration = "string: 'hello'";
  expect(snap(`string: 'hello'`)).toMatchSnapshot();
  expect(snap(`string: "hello"`)).toEqual(snap(canonicalStringDeclaration));
  expect(snap(`string: "'hello'"`)).toEqual(snap(canonicalStringDeclaration));
  expect(snap(`string: '"hello"'`)).toEqual(snap(canonicalStringDeclaration));

  expect(snap(`chiffre affaires: 20000 €/mois`)).toMatchSnapshot();
  expect(snap(`localisation . ZFE: oui`)).toMatchSnapshot();
  expect(snap(`âge >= 6`)).toMatchSnapshot();
});
