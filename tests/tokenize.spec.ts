import { expect, test } from "bun:test";
import { tokenize, printTokens } from "../src/tokenize";

test("Tokenize", () => {
  const tokens = tokenize(`
chiffre affaires: 20000 €/mois
`);
  expect(printTokens(tokens)).toMatchSnapshot();

  const tokens2 = tokenize(`localisation . ZFE: oui`);
  expect(printTokens(tokens2)).toMatchSnapshot();

  const tokens3 = tokenize(`âge >= 6`);
  expect(printTokens(tokens3)).toMatchSnapshot();
});
