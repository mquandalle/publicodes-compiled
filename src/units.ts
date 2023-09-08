export function conversionFactor(from: InferedType, to: InferedType) {
  if (from.type !== "number" || to.type !== "number") {
    throw new Error("Incorrect conversion");
  }
  const conversationTable = {
    "mois => an": 12,
    "an => mois": 1 / 12,
    "€/an => €/mois": 12,
    "€/mois => €/an": 1 / 12,
  };
  if (conversationTable[`${from.unit} => ${to.unit}`]) {
    return conversationTable[`${from.unit} => ${to.unit}`];
  }
  throw new Error(
    `Conversion factor from ${from.unit} to ${to.unit} is not implemented`
  );
}

export function inferUnit(
  operator: "*" | "/",
  left: InferedType,
  right: InferedType
): InferedType {
  if (left.type !== "number" || right.type !== "number") {
    throw new Error("Incorrect units");
  }
  if (operator === "*" && left.unit === "")
    return { type: "number", unit: right.unit };
  if (operator === "*" && right.unit === "")
    return { type: "number", unit: left.unit };
  throw new Error("Not implemented");
}
