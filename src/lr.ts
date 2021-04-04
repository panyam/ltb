import * as TSU from "@panyam/tsutils";
import { Sym, Grammar, Rule } from "./grammar";
import { Tokenizer, PTNode, Parser as ParserBase } from "./parser";
import { UnexpectedTokenError } from "./errors";
import { IDSet } from "./sets";

type Nullable<T> = TSU.Nullable<T>;
type NumMap<T> = TSU.NumMap<T>;

export enum LRActionType {
  ACCEPT,
  SHIFT,
  REDUCE,
  GOTO, // can *ONLY* be valid for non-terms
}

export class LRAction {
  // Type of action
  tag: LRActionType;

  // Next state to go to after performing the action (if valid).
  nextState: Nullable<LRItemSet> = null;

  // The rule to be used for a reduce action
  rule: Nullable<Rule> = null;

  toString(): string {
    if (this.tag == LRActionType.ACCEPT) return "Acc";
    else if (this.tag == LRActionType.SHIFT) {
      return "S" + this.nextState!.id;
    } else if (this.tag == LRActionType.REDUCE) {
      return "R <" + this.rule!.debugString + ">";
    } else {
      return "" + this.nextState!.id;
    }
  }

  equals(another: LRAction): boolean {
    return this.tag == another.tag && this.nextState == another.nextState && this.rule == another.rule;
  }

  static Shift(next: LRItemSet): LRAction {
    const out = new LRAction();
    out.tag = LRActionType.SHIFT;
    out.nextState = next;
    return out;
  }

  static Reduce(rule: Rule): LRAction {
    const out = new LRAction();
    out.tag = LRActionType.REDUCE;
    out.rule = rule;
    return out;
  }

  static Goto(nextState: LRItemSet): LRAction {
    const out = new LRAction();
    out.tag = LRActionType.GOTO;
    out.nextState = nextState;
    return out;
  }

  static Accept(): LRAction {
    const out = new LRAction();
    out.tag = LRActionType.ACCEPT;
    return out;
  }
}

export interface LRItem {
  id: number;
  readonly rule: Rule;
  readonly position: number;
  readonly key: string;
  readonly debugString: string;
  compareTo(another: this): number;
  equals(another: this): boolean;
  copy(): LRItem;

  /**
   * Get the LRItem corresponding to the given item by advancing
   * its cursor position.
   */
  advance(): LRItem;
}

export class LRItemSet {
  id = 0;
  readonly itemGraph: LRItemGraph;
  protected _key: Nullable<string> = null;
  readonly values: number[];

  constructor(ig: LRItemGraph, ...entries: number[]) {
    this.itemGraph = ig;
    this.values = entries;
  }

  // A way to cache the key of this item set.
  // Keys help make the comparison of two sets easy.
  get key(): string {
    if (this._key == null) {
      return this.sortedValues.join("/");
    }
    return this._key;
  }

  has(itemId: number): boolean {
    return this.values.indexOf(itemId) >= 0;
  }

  equals(another: LRItemSet): boolean {
    return this.key == another.key;
  }

  add(itemId: number): this {
    if (!this.has(itemId)) {
      this.values.push(itemId);
      this._key = null;
    }
    return this;
  }

  get size(): number {
    return this.values.length;
  }

  get sortedValues(): number[] {
    this.values.sort();
    return this.values;
  }

  get debugString(): string {
    return this.debugValue.join("\n");
  }

  get debugValue(): any {
    return this.sortedValues.map((v: number) => this.itemGraph.items.get(v).debugString);
  }
}

export abstract class LRItemGraph {
  readonly grammar: Grammar;

  // List of all unique LRItems that can be used in this item graph.
  // Note that since the same Item can reside in multiple sets only
  // one is created via the newItem method and it is referred
  // everwhere it is needed.

  /**
   * Using IDed sets of Items and ItemSets.
   * This ensures that only one copy of an item exists
   * "by value".
   */
  items: IDSet<LRItem>;
  itemSets: IDSet<LRItemSet>;

  // Goto sets for a set and a given transition out of it
  gotoSets: NumMap<NumMap<LRItemSet>> = {};

  constructor(grammar: Grammar) {
    this.grammar = grammar;
    this.items = new IDSet();
    this.itemSets = new IDSet();
  }

  abstract closure(itemSet: LRItemSet): LRItemSet;
  protected abstract startItem(): LRItem;

  reset(): void {
    this.grammar.refresh();
    this.gotoSets = {};
    this.items.clear();
    this.itemSets.clear();
    this.startSet();
  }

  refresh(): this {
    this.reset();
    this.grammar.refresh();
    this.evalGotoSets();
    return this;
  }

  /**
   * Computes all the goto sets used to create the graph of items.
   */
  protected evalGotoSets(): void {
    const out = this.itemSets;
    for (let i = 0; i < out.size; i++) {
      const currSet = out.get(i);
      for (const sym of this.grammar.allSymbols) {
        const gotoSet = this.goto(currSet, sym);
        if (gotoSet.size > 0) {
          this.setGoto(currSet, sym, gotoSet);
        }
      }
    }
  }

  /**
   * Computes the GOTO set of this ItemSet for a particular symbol transitioning
   * out of this item set.
   */
  goto(itemSet: LRItemSet, sym: Sym): LRItemSet {
    const out = new LRItemSet(this);
    for (const itemId of itemSet.values) {
      const item = this.items.get(itemId);
      // see if item.position points to "sym" in its rule
      const rule = item.rule;
      if (item.position < rule.rhs.length) {
        if (rule.rhs.syms[item.position] == sym) {
          // advance the item and add it
          out.add(this.items.ensure(item.advance()).id);
        }
      }
    }
    // compute the closure of the new set
    return this.closure(out);
  }

  protected newItemSet(...items: LRItem[]): LRItemSet {
    return new LRItemSet(this, ...items.map((item) => item.id));
  }

  get size(): number {
    return this.itemSets.size;
  }

  /**
   * Creates the set for the grammar.  This is done by creating an
   * augmented rule of the form S' -> S (where S is the start symbol of
   * the grammar) and creating the closure of this starting rule, ie:
   *
   * StartSet = closure({S' -> . S})
   */
  startSet(): LRItemSet {
    const startItem = this.startItem();
    const newset = this.newItemSet(startItem);
    return this.closure(newset);
  }

  protected ensureGotoSet(fromSet: LRItemSet): NumMap<LRItemSet> {
    if (!(fromSet.id in this.gotoSets)) {
      this.gotoSets[fromSet.id] = {};
    }
    return this.gotoSets[fromSet.id];
  }

  setGoto(fromSet: LRItemSet, sym: Sym, toSet: LRItemSet): void {
    const entries = this.ensureGotoSet(fromSet);
    entries[sym.id] = toSet;
  }

  getGoto(fromSet: LRItemSet, sym: Sym): Nullable<LRItemSet> {
    return (this.gotoSets[fromSet.id] || {})[sym.id] || null;
  }

  forEachGoto(itemSet: LRItemSet, visitor: (sym: Sym, nextSet: LRItemSet) => boolean | void): void {
    const gotoSet = this.gotoSets[itemSet.id] || {};
    for (const symid in gotoSet) {
      const sym = this.grammar.getSymById(symid as any) as Sym;
      const next = gotoSet[symid];
      if (visitor(sym, next) == false) break;
    }
  }

  gotoSetFor(itemSet: LRItemSet): NumMap<LRItemSet> {
    return this.gotoSets[itemSet.id] || {};
  }

  get debugValue(): any {
    const out = {} as any;
    this.itemSets.entries.forEach((iset) => {
      out[iset.id] = { items: [], next: {} };
      out[iset.id]["items"] = iset.debugValue;
      out[iset.id]["next"] = {};
      const g = this.gotoSets[iset.id];
      for (const symid in g) {
        const sym = this.grammar.getSymById(symid as any)!;
        out[iset.id]["next"][sym.label] = g[symid].id;
      }
    });
    return out;
  }
}

/**
 * A parsing table generator for SLR parsers.
 */
export class ParseTable {
  readonly grammar: Grammar;
  // Records which actions have conflicts
  conflictActions: NumMap<NumMap<boolean>> = {};

  /**
   * Maps symbol (by id) to the action;
   */
  actions: NumMap<NumMap<LRAction[]>> = {};

  constructor(grammar: Grammar) {
    this.grammar = grammar;
  }

  /**
   * Gets the action for a given sym from a given state.
   */
  getActions(state: LRItemSet, next: Sym, ensure = false): LRAction[] {
    let l1: NumMap<LRAction[]>;
    if (state.id in this.actions) {
      l1 = this.actions[state.id];
    } else if (ensure) {
      l1 = this.actions[state.id] = {};
    } else {
      return [];
    }

    if (next.id in l1) {
      return l1[next.id];
    } else if (ensure) {
      return (l1[next.id] = []);
    }
    return [];
  }

  addAction(state: LRItemSet, next: Sym, action: LRAction): void {
    const actions = this.getActions(state, next, true);
    if (actions.findIndex((ac) => ac.equals(action)) < 0) {
      actions.push(action);
    }
    if (actions.length > 1) {
      this.conflictActions[state.id] = this.conflictActions[state.id] || {};
      this.conflictActions[state.id][next.id] = true;
    }
  }

  get debugValue(): any {
    const out: any = {};
    for (const fromId in this.actions) {
      out[fromId] = {};
      for (const symId in this.actions[fromId]) {
        const sym = this.grammar.getSymById(symId as any)!;
        const actions = this.actions[fromId][sym.id] || [];
        if (actions.length > 0) {
          out[fromId][sym.label] = actions.map((a) => a.toString());
        }
      }
    }
    return out;
  }
}

export class ParseStack {
  readonly grammar: Grammar;
  readonly parseTable: ParseTable;
  // A way of marking the kind of item that is on the stack
  // true => isStateId
  // false => isSymbolId
  readonly stateStack: LRItemSet[] = [];
  readonly nodeStack: PTNode[] = [];
  constructor(g: Grammar, parseTable: ParseTable) {
    this.grammar = g;
    this.parseTable = parseTable;
    TSU.assert(g.startSymbol != null, "Start symbol not selected");
  }

  push(state: LRItemSet, node: PTNode): void {
    this.stateStack.push(state);
    this.nodeStack.push(node);
  }

  top(pop = false): [LRItemSet, PTNode] {
    if (this.isEmpty) {
      TSU.assert(false, "Stack is empty.");
    }
    const [state, node] = [this.stateStack[this.stateStack.length - 1], this.nodeStack[this.nodeStack.length - 1]];
    if (pop) {
      this.stateStack.pop();
      this.nodeStack.pop();
    }
    return [state, node];
  }

  pop(): [LRItemSet, PTNode] {
    return this.top(true);
  }

  get isEmpty(): boolean {
    return this.stateStack.length == 0 || this.nodeStack.length == 0;
  }
}

export class Parser extends ParserBase {
  parseTable: ParseTable;
  stack: ParseStack;
  readonly itemGraph: LRItemGraph;
  constructor(grammar: Grammar, parseTable: ParseTable, itemGraph: LRItemGraph) {
    super(grammar);
    TSU.assert((grammar.augStartRule || null) != null, "Grammar's start symbol has not been augmented");
    this.parseTable = parseTable;
    this.itemGraph = itemGraph;
    this.stack = new ParseStack(this.grammar, this.parseTable);
    this.stack.push(itemGraph.startSet(), new PTNode(grammar.augStartRule.nt));
  }

  /**
   * Parses the input and returns the resulting root Parse Tree node.
   */
  parse(): Nullable<PTNode> {
    const tokenizer = this.tokenizer;
    const stack = this.stack;
    const g = this.grammar;
    let output: Nullable<PTNode> = null;
    while (tokenizer.peek() != null || !stack.isEmpty) {
      const token = tokenizer.peek();
      const nextSym = token == null ? g.Eof : this.getSym(token);
      const nextValue = token == null ? null : token.value;
      let [topState, topNode] = stack.top();
      const actions = this.parseTable.getActions(topState, nextSym);
      if (actions == null || actions.length == 0) {
        throw new UnexpectedTokenError(token);
      }

      const action = this.resolveActions(actions, stack, tokenizer);
      if (action.tag == LRActionType.ACCEPT) {
        break;
      } else if (action.tag == LRActionType.SHIFT) {
        tokenizer.next();
        const newNode = new PTNode(nextSym, nextValue);
        stack.push(action.nextState!, newNode);
      } else {
        // reduce
        TSU.assert(action.rule != null, "Nonterm and ruleindex must be provided for a reduction action");
        const ruleLen = action.rule.rhs.length;
        // pop this many items off the stack and create a node
        // from this
        const newNode = new PTNode(action.rule.nt);
        for (let i = 0; i < ruleLen; i++) {
          const [_, node] = stack.pop();
          newNode.children.splice(0, 0, node);
        }
        [topState, topNode] = stack.top();
        const newAction = this.resolveActions(this.parseTable.getActions(topState, action.rule.nt), stack, tokenizer);
        TSU.assert(newAction != null, "Top item does not have an action.");
        stack.push(newAction.nextState!, newNode);
        this.notifyReduction(newNode, action.rule);
        output = newNode;
      }
    }
    // It is possible that here no reductions have been done!
    return output;
  }

  /**
   * called when a reduction has been performed.  At this time
   * all the children have already been reduced (and called with
   * this method).  Now is the opportunity for the parent node
   * reduction to perform custom actions.  Note that this method
   * cannot modify the stack.  It can only be used to perform
   * things like AST building or logging etc.
   */
  notifyReduction(node: PTNode, rule: Rule): void {
    //
  }

  /**
   * Pick an action among several actions based on several factors (eg curr parse stack, tokenizer etc).
   */
  resolveActions(actions: LRAction[], stack: ParseStack, tokenizer: Tokenizer): LRAction {
    if (actions.length > 1) {
      throw new Error("Multiple actions found.");
    }
    return actions[0];
  }
}

export class LR0Item implements LRItem {
  id = 0;
  readonly rule: Rule;
  readonly position: number;
  constructor(rule: Rule, position = 0) {
    this.rule = rule;
    this.position = position;
  }

  advance(): LRItem {
    TSU.assert(this.position < this.rule.rhs.length);
    return new LR0Item(this.rule, this.position + 1);
  }

  copy(): LRItem {
    return new LR0Item(this.rule, this.position);
  }

  /**
   * TODO - Instead of using strings as keys, can we use a unique ID?
   * If we assume a max limit on number of non terminals in our grammar
   * and a max limit on the number of rules per non terminal and a
   * max limit on the size of each rule then we can uniquely identify
   * a rule and position for a non-terminal by a single (64 bit) number
   *
   * We can use the following bitpacking to nominate this:
   *
   * <padding 16 bits><nt id 16 bits><ruleIndex 16 bits><position 16 bits>
   */
  get key(): string {
    TSU.assert(!isNaN(this.rule.id), "Rule's ID is not yet set.");
    return this.rule.id + ":" + this.position;
  }

  compareTo(another: this): number {
    let diff = this.rule.id - another.rule.id;
    if (diff == 0) diff = this.position - another.position;
    return diff;
  }

  equals(another: this): boolean {
    return this.compareTo(another) == 0;
  }

  get debugString(): string {
    const rule = this.rule;
    const pos = this.position;
    const pre = rule.rhs.syms.slice(0, pos).join(" ");
    const post = rule.rhs.syms.slice(pos).join(" ");
    return `${rule.nt} -> ${pre} . ${post}`;
  }
}

export class LR0ItemGraph extends LRItemGraph {
  protected startItem(): LRItem {
    const startSymbol = this.grammar.startSymbol;
    TSU.assert(startSymbol != null, "Start symbol must be set");
    TSU.assert((this.grammar.augStartRule || null) != null, "Grammar is not augmented");
    return this.items.ensure(new LR0Item(this.grammar.augStartRule));
  }

  /**
   * Computes the closure of a given item set and returns a new
   * item set.
   */
  closure(itemSet: LRItemSet): LRItemSet {
    const out = new LRItemSet(this, ...itemSet.values);
    for (let i = 0; i < out.values.length; i++) {
      const itemId = out.values[i];
      const item = this.items.get(itemId)!;
      const rule = item.rule;
      // Evaluate the closure
      // Cannot do anything past the end
      if (item.position < rule.rhs.length) {
        const sym = rule.rhs.syms[item.position];
        if (!sym.isTerminal) {
          for (const rule of this.grammar.rulesForNT(sym)) {
            const newItem = this.items.ensure(new LR0Item(rule, 0));
            out.add(newItem.id);
          }
        }
      }
    }
    return out.size == 0 ? out : this.itemSets.ensure(out);
  }
}

export class LR1Item extends LR0Item {
  readonly lookahead: Sym;
  constructor(lookahead: Sym, rule: Rule, position = 0) {
    super(rule, position);
    this.lookahead = lookahead;
  }

  copy(): LR1Item {
    return new LR1Item(this.lookahead, this.rule, this.position);
  }

  advance(): LRItem {
    TSU.assert(this.position < this.rule.rhs.length);
    return new LR1Item(this.lookahead, this.rule, this.position + 1);
  }

  get key(): string {
    return this.rule.id + ":" + this.position + ":" + this.lookahead.id;
  }

  compareTo(another: this): number {
    let diff = super.compareTo(another);
    if (diff == 0) diff = this.lookahead.id - another.lookahead.id;
    return diff;
  }

  equals(another: this): boolean {
    return this.compareTo(another) == 0;
  }

  get debugString(): string {
    const pos = this.position;
    const pre = this.rule.rhs.syms.slice(0, pos).join(" ");
    const post = this.rule.rhs.syms.slice(pos).join(" ");
    return `${this.rule.nt.label} -> ${pre} . ${post}` + "   /   " + this.lookahead.label;
  }
}

export class LR1ItemGraph extends LRItemGraph {
  /**
   * Overridden to create LR1ItemSet objects with the start state
   * also including the EOF marker as the lookahead.
   *
   * StartSet = closure({S' -> . S, $})
   */
  startItem(): LRItem {
    const startSymbol = this.grammar.startSymbol;
    TSU.assert(startSymbol != null, "Start symbol must be set");
    TSU.assert((this.grammar.augStartRule || null) != null, "Grammar is not augmented");
    return this.items.ensure(new LR1Item(this.grammar.Eof, this.grammar.augStartRule, 0));
  }

  /**
   * Computes the closure of this item set and returns a new
   * item set.
   */
  closure(itemSet: LRItemSet): LRItemSet {
    const out = new LRItemSet(this, ...itemSet.values);
    for (let i = 0; i < out.values.length; i++) {
      const itemId = out.values[i];
      const item = this.items.get(itemId) as LR1Item;
      // Evaluate the closure
      // Cannot do anything past the end
      if (item.position >= item.rule.rhs.length) continue;
      const B = item.rule.rhs.syms[item.position];
      if (B.isTerminal) continue;

      const suffix = item.rule.rhs.copy().append(item.lookahead);
      this.grammar.firstSets.forEachTermIn(suffix, item.position + 1, (term) => {
        if (term != null) {
          // For each rule [ B -> beta, term ] add it to
          // our list of items if it doesnt already exist
          const bRules = this.grammar.rulesForNT(B);
          for (const br of bRules) {
            const newItem = this.items.ensure(new LR1Item(term, br, 0));
            out.add(newItem.id);
          }
        }
      });
    }
    return out.size == 0 ? out : this.itemSets.ensure(out);
  }
}