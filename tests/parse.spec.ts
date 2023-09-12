import { expect, test } from "bun:test";
import { parse } from "../src/parser";
import { printTokens, tokenize } from "../src/tokenizer";

test("parse list and records", () => {
  const listAndRecords = `
simple record:
    a: 1
    b: 2

simple lists:
    a:
        - "ok"
        - "okok"
    b:
        - "ok"
        - "okok"

imbricated records:
    a:
        b:
            c: 1

mixed list and records:
    a:
        a1:
            - "ok"
            - "okok"
        a2:
            - "ok"
            - "okok"
    b:
        b1:
            - b11:
                - "ok"
                - b111:
                    - "ok"
                    - "okok"
        b2: okok

recursive lists:
    a:
      - toutes ces conditions:
        - "ok"
        - "okok"
      - une de ces conditions:
        - "ok"
        - "okok"

deep tree:
    a:
        aL:
            - a:
                aL:
                    - a:
                        aOk: ok
    b: ok
`.trim();
  const parsedPublicodes = parse(listAndRecords);

  expect(
    printTokens(tokenize(listAndRecords), { lineNumbers: true })
  ).toMatchSnapshot();

  const rules = Object.fromEntries(
    parsedPublicodes.rules.map((r) => [r.name, r.value])
  );

  expect(rules["simple record"]).toEqual({
    type: "record",
    a: { type: "constant", value: "1" },
    b: { type: "constant", value: "2" },
  });

  expect(rules["simple lists"]).toEqual({
    type: "record",
    a: [
      { type: "constant", value: "ok" },
      { type: "constant", value: "okok" },
    ],
    b: [
      { type: "constant", value: "ok" },
      { type: "constant", value: "okok" },
    ],
  });

  expect(rules["imbricated records"]).toEqual({
    type: "record",
    a: {
      type: "record",
      b: {
        type: "record",
        c: { type: "constant", value: "1" },
      },
    },
  });

  expect(rules["recursive lists"]).toEqual({
    type: "record",
    a: [
      {
        type: "toutes ces conditions",
        value: [
          { type: "constant", value: "ok" },
          { type: "constant", value: "okok" },
        ],
      },
      {
        type: "une de ces conditions",
        value: [
          { type: "constant", value: "ok" },
          { type: "constant", value: "okok" },
        ],
      },
    ],
  });

  expect(rules["mixed list and records"]).toEqual({
    type: "record",
    a: {
      type: "record",
      a1: [
        { type: "constant", value: "ok" },
        { type: "constant", value: "okok" },
      ],
      a2: [
        { type: "constant", value: "ok" },
        { type: "constant", value: "okok" },
      ],
    },
    b: {
      type: "record",
      b1: [
        {
          type: "record",
          b11: [
            { type: "constant", value: "ok" },
            {
              type: "record",
              b111: [
                { type: "constant", value: "ok" },
                { type: "constant", value: "okok" },
              ],
            },
          ],
        },
      ],
      b2: { type: "constant", value: "okok" },
    },
  });

  expect(rules["deep tree"]).toEqual({
    type: "record",
    a: {
      type: "record",
      aL: [
        {
          type: "record",
          a: {
            type: "record",
            aL: [
              {
                type: "record",
                a: {
                  type: "record",
                  aOk: { type: "constant", value: "ok" },
                },
              },
            ],
          },
        },
      ],
    },
    b: { type: "constant", value: "ok" },
  });
});

test("valeur", () => {
  const parsedPublicodes = parse(
    `
aide:
    titre: Aide vélo
    valeur: 50 €
    `.trim()
  );
  expect(parsedPublicodes.rules[0]).toEqual({
    type: "rule",
    name: "aide",
    titre: "Aide vélo",
    unit: {
      type: "number",
      unit: "€",
    },
    value: {
      type: "constant",
      value: 50,
      unit: "€",
    },
  });
});

test("chained mechanisms", () => {
  const parsedPublicodes = parse(
    `
aide:
    applicable si: oui
    valeur: 50 €
`.trim()
  );
  expect(parsedPublicodes.rules[0]).toEqual({
    type: "rule",
    name: "aide",
    unit: {
      type: "number",
      unit: "€",
    },
    value: {
      type: "applicable si",
      "applicable si": {
        type: "constant",
        value: true,
      },
      value: {
        type: "constant",
        value: 50,
        unit: "€",
      },
    },
  });
});
