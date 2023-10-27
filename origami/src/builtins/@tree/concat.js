import { Tree, getRealmObjectPrototype } from "@graphorigami/core";
import assertScopeIsDefined from "../../misc/assertScopeIsDefined.js";

/**
 * Concatenate the text content of objects or trees.
 *
 * @typedef {import("@graphorigami/types").AsyncTree} AsyncTree
 *
 * @this {AsyncTree|null}
 * @param {any[]} args
 */
export default async function concat(...args) {
  assertScopeIsDefined(this);
  let tree;
  if (args.length === 0) {
    tree = await this?.get("@current");
    if (tree === undefined) {
      return undefined;
    }
  } else {
    tree = Tree.from(args);
  }

  // The core concat operation is a map-reduce: convert everything to strings,
  // then concatenate the strings.
  const scope = this;
  const mapFn = async (value) => getText(value, scope);
  const reduceFn = (values) => values.join("");
  return Tree.mapReduce(tree, mapFn, reduceFn);
}

async function getText(value, scope) {
  // If the value is a function (e.g., a lambda), use its result.
  if (typeof value === "function") {
    value = await value.call(scope);
  }

  // Convert to text, preferring .toString but avoiding dumb Object.toString.
  // Exception: if the result is an array, we'll concatenate the values.
  let text;
  if (!value) {
    // Treat falsy values as the empty string.
    text = "";
  } else if (typeof value === "string") {
    text = value;
  } else if (
    !(value instanceof Array) &&
    value.toString !== getRealmObjectPrototype(value).toString
  ) {
    text = value.toString();
  } else {
    // Anything else maps to the empty string.
    text = "";
  }

  return text;
}

concat.usage = `concat <...objs>\tConcatenate text and/or trees of text`;
concat.documentation = "https://graphorigami.org/cli/builtins.html#concat";
