import { trailingSlash } from "@weborigami/async-tree";
import codeFragment from "../runtime/codeFragment.js";
import * as ops from "../runtime/ops.js";

// Parser helpers

/** @typedef {import("../../index.ts").Code} Code */

// Marker for a reference that may be a builtin or a scope reference
export const undetermined = Symbol("undetermined");

const builtinRegex = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * If a parse result is an object that will be evaluated at runtime, attach the
 * location of the source code that produced it for debugging and error messages.
 *
 * @param {Code} code
 * @param {any} location
 */
export function annotate(code, location) {
  if (typeof code === "object" && code !== null && location) {
    code.location = location;
    code.source = codeFragment(location);
  }
  return code;
}

/**
 * The indicated code is being used to define a property named by the given key.
 * Rewrite any [ops.scope, key] calls to be [ops.inherited, key] to avoid
 * infinite recursion.
 *
 * @param {Code} code
 * @param {string} key
 */
function avoidRecursivePropertyCalls(code, key) {
  if (!(code instanceof Array)) {
    return code;
  }
  /** @type {Code} */
  let modified;
  if (
    code[0] === ops.scope &&
    trailingSlash.remove(code[1]) === trailingSlash.remove(key)
  ) {
    // Rewrite to avoid recursion
    // @ts-ignore
    modified = [ops.inherited, code[1]];
  } else if (code[0] === ops.lambda && code[1].includes(key)) {
    // Lambda that defines the key; don't rewrite
    return code;
  } else {
    // Process any nested code
    // @ts-ignore
    modified = code.map((value) => avoidRecursivePropertyCalls(value, key));
  }
  annotate(modified, code.location);
  return modified;
}

/**
 * Downgrade a potential builtin reference to a scope reference.
 *
 * @param {Code} code
 */
export function downgradeReference(code) {
  if (code && code.length === 2 && code[0] === undetermined) {
    /** @type {Code} */
    // @ts-ignore
    const result = [ops.scope, code[1]];
    annotate(result, code.location);
    return result;
  } else {
    return code;
  }
}

export function makeArray(entries) {
  let currentEntries = [];
  const spreads = [];

  for (const value of entries) {
    if (Array.isArray(value) && value[0] === ops.spread) {
      if (currentEntries.length > 0) {
        const location = { ...currentEntries[0].location };
        location.end = currentEntries.at(-1).location.end;
        /** @type {Code} */
        // @ts-ignore
        const spread = [ops.array, ...currentEntries];
        annotate(spread, location);
        spreads.push(spread);
        currentEntries = [];
      }
      spreads.push(...value.slice(1));
    } else {
      currentEntries.push(value);
    }
  }

  // Finish any current entries.
  if (currentEntries.length > 0) {
    spreads.push([ops.array, ...currentEntries]);
    currentEntries = [];
  }

  let result;
  if (spreads.length > 1) {
    result = [ops.merge, ...spreads];
  } else if (spreads.length === 1) {
    result = spreads[0];
  } else {
    result = [ops.array];
  }

  annotate(result, entries.location);
  return result;
}

/**
 * Create a chain of binary operators. The head is the first value, and the tail
 * is an array of [operator, value] pairs.
 *
 * @param {Code} left
 */
export function makeBinaryOperation(left, [operatorToken, right]) {
  const operators = {
    "!=": ops.notEqual,
    "!==": ops.notStrictEqual,
    "%": ops.remainder,
    "&": ops.bitwiseAnd,
    "*": ops.multiplication,
    "**": ops.exponentiation,
    "+": ops.addition,
    "-": ops.subtraction,
    "/": ops.division,
    "<": ops.lessThan,
    "<<": ops.shiftLeft,
    "<=": ops.lessThanOrEqual,
    "==": ops.equal,
    "===": ops.strictEqual,
    ">": ops.greaterThan,
    ">=": ops.greaterThanOrEqual,
    ">>": ops.shiftRightSigned,
    ">>>": ops.shiftRightUnsigned,
    "^": ops.bitwiseXor,
    "|": ops.bitwiseOr,
  };
  const op = operators[operatorToken];

  /** @type {Code} */
  // @ts-ignore
  const value = [op, left, right];
  value.location = {
    source: left.location.source,
    start: left.location.start,
    end: right.location.end,
  };

  return value;
}

/**
 * @param {Code} target
 * @param {any[]} args
 */
export function makeCall(target, args) {
  if (!(target instanceof Array)) {
    const error = new SyntaxError(`Can't call this like a function: ${target}`);
    /** @type {any} */ (error).location = /** @type {any} */ (target).location;
    throw error;
  }

  const source = target.location.source;
  let start = target.location.start;
  let end = target.location.end;

  let fnCall;
  if (args[0] === ops.traverse) {
    let tree = target;

    if (tree[0] === undetermined) {
      // In a traversal, downgrade ops.builtin references to ops.scope
      tree = downgradeReference(tree);
      if (tree[0] === ops.scope && !trailingSlash.has(tree[1])) {
        // Target didn't parse with a trailing slash; add one
        tree[1] = trailingSlash.add(tree[1]);
      }
    }

    if (args.length > 1) {
      // Regular traverse
      const keys = args.slice(1);
      fnCall = [ops.traverse, tree, ...keys];
    } else {
      // Traverse without arguments equates to unpack
      fnCall = [ops.unpack, tree];
    }
  } else if (args[0] === ops.template) {
    // Tagged template
    fnCall = [upgradeReference(target), ...args.slice(1)];
  } else {
    // Function call with explicit or implicit parentheses
    fnCall = [upgradeReference(target), ...args];
  }

  // Create a location spanning the newly-constructed function call.
  if (args instanceof Array) {
    // @ts-ignore
    end = args.location?.end ?? args.at(-1)?.location?.end;
    if (end === undefined) {
      throw "Internal parser error: no location for function call argument";
    }
  }

  // @ts-ignore
  annotate(fnCall, { start, source, end });

  return fnCall;
}

/**
 * For functions that short-circuit arguments, we need to defer evaluation of
 * the arguments until the function is called. Exception: if the argument is a
 * literal, we leave it alone.
 *
 * @param {any[]} args
 */
export function makeDeferredArguments(args) {
  return args.map((arg) => {
    if (arg instanceof Array && arg[0] === ops.literal) {
      return arg;
    }
    const fn = [ops.lambda, [], arg];
    // @ts-ignore
    annotate(fn, arg.location);
    return fn;
  });
}

export function makeObject(entries, op) {
  let currentEntries = [];
  const spreads = [];

  for (let [key, value] of entries) {
    if (key === ops.spread) {
      if (value[0] === ops.object) {
        // Spread of an object; fold into current object
        currentEntries.push(...value.slice(1));
      } else {
        // Spread of a tree; accumulate
        if (currentEntries.length > 0) {
          spreads.push([op, ...currentEntries]);
          currentEntries = [];
        }
        spreads.push(value);
      }
      continue;
    }

    if (value instanceof Array) {
      if (
        value[0] === ops.getter &&
        value[1] instanceof Array &&
        value[1][0] === ops.literal
      ) {
        // Optimize a getter for a primitive value to a regular property
        value = value[1];
      }
    }

    currentEntries.push([key, value]);
  }

  // Finish any current entries.
  if (currentEntries.length > 0) {
    spreads.push([op, ...currentEntries]);
    currentEntries = [];
  }

  if (spreads.length > 1) {
    return [ops.merge, ...spreads];
  }
  if (spreads.length === 1) {
    return spreads[0];
  } else {
    return [op];
  }
}

// Similar to a function call, but the order is reversed.
export function makePipeline(arg, fn) {
  const upgraded = upgradeReference(fn);
  const result = makeCall(upgraded, [arg]);
  const source = fn.location.source;
  let start = arg.location.start;
  let end = fn.location.end;
  // @ts-ignore
  annotate(result, { start, source, end });
  return result;
}

// Define a property on an object.
export function makeProperty(key, value) {
  const modified = avoidRecursivePropertyCalls(value, key);
  return [key, modified];
}

export function makeReference(identifier) {
  // We can't know for sure that an identifier is a builtin reference until we
  // see whether it's being called as a function.
  let op;
  if (builtinRegex.test(identifier)) {
    op = identifier.endsWith(":")
      ? // Namespace is always a builtin reference
        ops.builtin
      : undetermined;
  } else {
    op = ops.scope;
  }
  return [op, identifier];
}

export function makeTemplate(op, head, tail) {
  const location = { ...head.location };
  const strings = [head[1]];
  const values = [];
  for (const [value, literal] of tail) {
    const concat = [ops.concat, value];
    // @ts-ignore
    annotate(concat, value.location);
    values.push(concat);
    strings.push(literal[1]);
  }
  if (tail.length > 0) {
    location.end = tail.at(-1)[1].location.end;
  }
  // @ts-ignore
  annotate(strings, location);
  /** @type {Code} */
  // @ts-ignore
  const literal = [ops.literal, strings];
  annotate(literal, location);
  // @ts-ignore
  return annotate([op, literal, ...values], location);
}

export function makeUnaryOperation(operator, value) {
  const operators = {
    "!": ops.logicalNot,
    "+": ops.unaryPlus,
    "-": ops.unaryMinus,
    "~": ops.bitwiseNot,
  };
  return [operators[operator], value];
}

/**
 * Upgrade a potential builtin reference to an actual builtin reference.
 *
 * @param {Code} code
 */
export function upgradeReference(code) {
  if (code.length === 2 && code[0] === undetermined) {
    /** @type {Code} */
    // @ts-ignore
    const result = [ops.builtin, code[1]];
    annotate(result, code.location);
    return result;
  } else {
    return code;
  }
}
