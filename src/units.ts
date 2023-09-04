export function conversionFactor(from: string, to: string) {
  const conversationTable = {
    "mois => an": 12,
    "an => mois": 1 / 12,
    "€/an => €/mois": 12,
    "€/mois => €/an": 1 / 12,
  };
  if (conversationTable[`${from} => ${to}`]) {
    return conversationTable[`${from} => ${to}`];
  }
  throw new Error(`Conversion factor from ${from} to ${to} is not implemented`);
}

export function inferUnit(operator: "*" | "/", left: string, right: string) {
  if (operator === "*" && left === undefined) return right;
  if (operator === "*" && right === undefined) return left;
  throw new Error("Not implemented");
}
