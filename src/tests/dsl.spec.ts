import * as TSU from "@panyam/tsutils";
import { Grammar, Str, Sym } from "../grammar";
import { Tokenizer as EBNFTokenizer, Parser as EBNFParser } from "../dsl";
import { expectRules } from "./utils";
import { printGrammar } from "../utils";

function symLabels(s: readonly Sym[], skipAux = true): string[] {
  return s.filter((l) => !skipAux || !l.isAuxiliary).map((x: Sym) => x.label);
}

function expectListsEqual(l1: string[], l2: string[]): void {
  l1 = l1.sort();
  l2 = l2.sort();
  expect(l1).toEqual(l2);
}

function loadGrammar(input: string, debug = false): Grammar {
  if (debug) {
    const l = EBNFTokenizer();
    console.log("Prog: \n", `${l.vm.prog.debugValue().join("\n")}`);
  }
  const out = new EBNFParser(input).grammar;
  if (debug) {
    console.log(printGrammar(out, false));
  }
  return out;
}

describe("EBNF Tests", () => {
  test("JSON", () => {
    const g = loadGrammar(
      `
      %token NUMBER /-?\\d+(\\.\\d+)?([eE][+-]?\\d+)?/
      %token STRING /".*?(?<!\\\\)"/
      %skip /[ \\t\\n\\f\\r]+/

      Value -> Dict | List | STRING | NUMBER | Boolean | "null" ;
      List -> "[" Value ( "," value ) * "]" ;
      Dict -> "{" [ Pair ("," Pair)* ] "}" ;
      Pair -> STRING ":" value ;
      Boolean -> "true" | "false" ;
      `,
    );
  });
  test("Test1", () => {
    const g = new EBNFParser(`S -> A | B | C ;`).grammar;
    // console.log("G.nonTerminals: ", g.nonTerminals);

    expect(g.nonTerminals.length).toBe(1);
    expect(g.terminals.length).toBe(5);
  });

  test("Test1", () => {
    const g = new EBNFParser(`
      S -> A B | C ;
      A -> 0 B | C  ;
      B -> 1 | A 0 ;
      C -> A C | C ;
      D -> "d" ;
    `).grammar;

    expectListsEqual(symLabels(g.nonTerminals), ["S", "A", "B", "C", "D"]);
    expectListsEqual(symLabels(g.terminals), ['"0"', '"1"', '"d"', "", "$end"]);
    expectRules(g, "S", g.seq("A", "B"), "C");
    expectRules(g, "A", g.seq('"0"', "B"), "C");
    expectRules(g, "B", '"1"', g.seq("A", '"0"'));
    expectRules(g, "C", g.seq("A", "C"), "C");
    expectRules(g, "D", '"d"');
  });
  test("Test Simple", () => {
    const g = loadGrammar(
      `
      Y -> A ? [ B C D ]  [ X | Y | Z ] * [ 1 2 3 ] + ;
    `,
    );
    expectListsEqual(symLabels(g.nonTerminals), ["Y"]);
    expectListsEqual(symLabels(g.terminals), ['"1"', '"2"', '"3"', "X", "Z", "A", "B", "C", "D", "", "$end"]);
    expectRules(
      g,
      "Y",
      g.seq(
        g.opt("A"),
        g.opt(g.seq("B", "C", "D")),
        g.atleast0(g.opt(g.anyof("X", "Y", "Z"))),
        g.atleast1(g.opt(g.seq('"1"', '"2"', '"3"'))),
      ),
    );
  });

  test("Test2", () => {
    const g = loadGrammar(
      `
      Expr -> Term ( "+" | "-" ) Expr ;
      Term -> Factor ( DIV | MULT ) Term ;
      Factor -> NUM | "(" Expr ")" ;
      X -> A B C D Z 1 2 3;
    `,
    );

    expectListsEqual(symLabels(g.nonTerminals), ["Expr", "Term", "Factor", "X"]);
    expectListsEqual(symLabels(g.terminals), [
      '"1"',
      "",
      "$end",
      '"2"',
      '"3"',
      '"+"',
      "Z",
      '"-"',
      "A",
      "B",
      "C",
      "D",
      "DIV",
      "MULT",
      '"("',
      '")"',
      "NUM",
    ]);
    expectRules(g, "Expr", g.seq("Term", g.anyof('"+"', '"-"'), "Expr"));
    expectRules(g, "Term", g.seq("Factor", g.anyof("DIV", "MULT"), "Term"));
    expectRules(g, "X", g.seq("A", "B", "C", "D", "Z", '"1"', '"2"', '"3"'));
    expectRules(g, "Factor", "NUM", g.seq('"("', "Expr", '")"'));
  });

  test("Test3", () => {
    const g = new EBNFParser(`
      X -> A | B | ;
      Y -> B | ;
    `).grammar;

    expectListsEqual(symLabels(g.nonTerminals), ["X", "Y"]);
    expectListsEqual(symLabels(g.terminals), ["", "$end", "A", "B"]);
    expectRules(g, "X", "A", "B", new Str());
  });

  test("Test4 With Tokenizer", () => {
    const parser = new EBNFParser(`

      %token a "a"
      %token x "x"
      %token y "y"

      X -> A | B | x ;
      Y -> B | y ;
      A -> a ;
    `);
    const g = parser.grammar;
    const t = parser.generatedTokenizer;

    expectListsEqual(symLabels(g.nonTerminals), ["X", "Y", "A"]);
    expectListsEqual(symLabels(g.terminals), ["", "$end", "B", "x", "a", "y"]);
  });

  test("Test With Comments - JS RE", () => {
    const parser = new EBNFParser(String.raw`
      // Skip comments
      %skip                   /\/\*.*\*\//s
      %skip                   /\/\/.*$/m
      %skip                   /[ \t\v\n\r\f]+/
      /**
        * Ignore this comment
      */
      // And this one too
      %token a "a"
      %token x "x"
      %token y "y"

      X -> A | B | x ;
      Y -> B | y ;
      A -> a ;
    `);
    const g = parser.grammar;
    const t = parser.generatedTokenizer;

    expectListsEqual(symLabels(g.nonTerminals), ["X", "Y", "A"]);
    expectListsEqual(symLabels(g.terminals), ["", "$end", "B", "x", "a", "y"]);
  });

  test("Test With Comments - Flex RE", () => {
    const LEXER = String.raw`
  %resyntax   flex

  %define   O             [0-7]
  %define   D             [0-9]
  %define   NZ            [1-9]
  %define   L             [a-zA-Z_]
  %define   A             [a-zA-Z_0-9]
  %define   H             [a-fA-F0-9]
  %define   HP            (0[xX])
  %define   E             ([Ee][+-]?{D}+)
  %define   P             ([Pp][+-]?{D}+)
  %define   FS            (f|F|l|L)
  %define   IS            (((u|U)(l|L|ll|LL)?)|((l|L|ll|LL)(u|U)?))
  %define   CP            (u|U|L)
  %define   SP            (u8|u|U|L)
  %define   ES            (\\(['"\?\\abfnrtv]|[0-7]{1,3}|x[a-fA-F0-9]+))
  %define   WS            [ \t\v\n\f\r]

  // comments
  %skip                   "/*"[.\n]*?"*/"
  %skip                   "//".*$
  %skip                   {WS}+

      %token a "a"
      %token x "x"
      %token y "y"
      `;

    const parser = new EBNFParser(String.raw`
      ${LEXER}
      X -> A | B | x ;
      Y -> B | y ;
      A -> a ;
    `);
    const g = parser.grammar;
    const t = parser.generatedTokenizer;

    expectListsEqual(symLabels(g.nonTerminals), ["X", "Y", "A"]);
    expectListsEqual(symLabels(g.terminals), ["", "$end", "B", "x", "a", "y"]);
  });
});