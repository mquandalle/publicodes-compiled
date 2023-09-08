import { expect, test } from "bun:test";
import { tokenize, printTokens } from "../src/tokenize";

const snap = (intput: string) => printTokens(tokenize(intput));

test("Tokenize", () => {
  const canonicalStringDeclaration = snap("string: 'hello'");
  expect(canonicalStringDeclaration).toMatchSnapshot();
  expect(snap(`string: "hello"`)).toEqual(canonicalStringDeclaration);
  expect(snap(`string: "'hello'"`)).toEqual(canonicalStringDeclaration);
  expect(snap(`string: '"hello"'`)).toEqual(canonicalStringDeclaration);

  expect(snap(`chiffre affaires: 20000 €/mois`)).toMatchSnapshot();
  expect(snap(`localisation . ZFE: oui`)).toMatchSnapshot();
  expect(snap(`âge >= 6`)).toMatchSnapshot();
});
