import { Grammar } from "../grammar";
import { EBNFParser } from "../ebnf";
import { expectNullables, expectFSEntries } from "./utils";
import Samples from "./samples";

describe("FollowSet Tests", () => {
  test("Tests 1", () => {
    const g = new EBNFParser(` A -> a b c ; `).grammar;

    const ns = g.nullables;
    const fs = g.followSets;
    expectFSEntries(g, fs, { A: [g.Eof.label] });
  });

  test("Tests 2", () => {
    const g = new EBNFParser(` A -> B a ; B -> b ; `).grammar;

    const ns = g.nullables;
    const firstSets = g.firstSets;
    expect(g.followSets.debugValue).toEqual({ A: "<$end>", B: "<a>" });
  });

  test("Tests 3", () => {
    const g = new EBNFParser(Samples.expr2).grammar;

    const ns = g.nullables;
    expect(g.firstSets.debugValue).toEqual({
      E: "<OPEN, id>",
      T: "<OPEN, id>",
      E1: "<, PLUS>",
      F: "<OPEN, id>",
      T1: "<, STAR>",
    });
    expect(g.followSets.debugValue).toEqual({
      E: "<$end, CLOSE>",
      T: "<$end, CLOSE, PLUS>",
      E1: "<$end, CLOSE>",
      F: "<$end, CLOSE, PLUS, STAR>",
      T1: "<$end, CLOSE, PLUS>",
    });
  });

  test("Tests 4", () => {
    const g = new EBNFParser(`
      E -> T X ;
      X -> PLUS E | ;
      T -> int Y | OPEN E CLOSE ;
      Y -> STAR T | ;
    `).grammar;

    expect(g.firstSets.debugValue).toEqual({
      E: "<OPEN, int>",
      T: "<OPEN, int>",
      X: "<, PLUS>",
      Y: "<, STAR>",
    });
    expect(g.followSets.debugValue).toEqual({
      E: "<$end, CLOSE>",
      T: "<$end, CLOSE, PLUS>",
      X: "<$end, CLOSE>",
      Y: "<$end, CLOSE, PLUS>",
    });
  });

  test("Tests 5", () => {
    const g = new EBNFParser(Samples.Sample4).grammar;

    const ns = g.nullables;
    expectNullables(ns, ["V", "W"]);
    expect(g.firstSets.debugValue).toEqual({ S: "<a, c, d, e, f>", T: "<a, e>", U: "<f>", V: "<, c>", W: "<, d>" });
    expect(g.followSets.debugValue).toEqual({
      S: "<$end>",
      T: "<$end, f>",
      U: "<$end, a, b, c, d, e>",
      V: "<$end, d, f>",
      W: "<$end, c, d, f>",
    });
  });

  test("Tests 6", () => {
    const g = new EBNFParser(`
      S -> S A | ;
      A -> X | b X | c X ;
      X -> X x | ;
    `).grammar;

    expect(g.firstSets.debugValue).toEqual({ S: "<, b, c, x>", A: "<, b, c, x>", X: "<, x>" });
    expect(g.followSets.debugValue).toEqual({ S: "<$end, b, c, x>", A: "<$end, b, c, x>", X: "<$end, b, c, x>" });
  });

  test("Tests JSON with Lists only", () => {
    const g = new Grammar({ auxNTPrefix: "_" });
    new EBNFParser(
      `
        Value -> List | NULL ;
        List -> OSQ Value ( COMMA Value ) * CSQ ;
    `,
      { grammar: g },
    );

    expect(g.firstSets.debugValue).toEqual({ Value: "<NULL, OSQ>", List: "<OSQ>", _0: "<, COMMA>" });
    expect(g.followSets.debugValue).toEqual({
      Value: "<$end, COMMA, CSQ>",
      List: "<$end, COMMA, CSQ>",
      _0: "<CSQ>",
    });
  });

  test("Tests Bigger JSON", () => {
    const g = new Grammar({ auxNTPrefix: "_" });
    new EBNFParser(
      `
        Value -> Dict | List | STRING | NUMBER | TRUE | FALSE | NULL ;
        List -> OSQ [ Value ( COMMA Value ) * ] CSQ ;
        Dict -> OBRACE [ Pair (COMMA Pair)* ] CBRACE ;
        Pair -> STRING COLON Value ;
    `,
      { grammar: g },
    );

    /*
    console.log(
      "Grammar: \n",
      g.print({ lambdaSymbol: "''", ruleSep: "->", includeSemiColon: false }).join("\n"),
      "\nFirstSets: \n",
      g.firstSets.debugValue,
      "\nFollowSets: \n",
      g.followSets.debugValue,
    );
   */

    expect(g.firstSets.debugValue).toEqual({
      Value: "<FALSE, NULL, NUMBER, OBRACE, OSQ, STRING, TRUE>",
      Dict: "<OBRACE>",
      List: "<OSQ>",
      _0: "<, COMMA>",
      _1: "<, FALSE, NULL, NUMBER, OBRACE, OSQ, STRING, TRUE>",
      Pair: "<STRING>",
      _2: "<, COMMA>",
      _3: "<, STRING>",
    });
    expect(g.followSets.debugValue).toEqual({
      Value: "<$end, CBRACE, COMMA, CSQ>",
      Dict: "<$end, CBRACE, COMMA, CSQ>",
      List: "<$end, CBRACE, COMMA, CSQ>",
      _0: "<CSQ>",
      _1: "<CSQ>",
      Pair: "<CBRACE, COMMA>",
      _2: "<CBRACE>",
      _3: "<CBRACE>",
    });
  });
});
