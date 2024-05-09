import assertScopeIsDefined from "../misc/assertScopeIsDefined.js";
import mapFn from "./@mapFn.js";

/**
 * Map a hierarchical tree of keys and values to a new tree of keys and values.
 *
 * @typedef {import("@weborigami/async-tree").KeyFn} KeyFn
 * @typedef {import("@weborigami/async-tree").Treelike} Treelike
 * @typedef {import("@weborigami/async-tree").ValueKeyFn} ValueKeyFn
 * @typedef {import("@weborigami/async-tree").TreeTransform} TreeTransform
 * @typedef {import("@weborigami/types").AsyncTree} AsyncTree
 *
 * @typedef {{ deep?: boolean, description?: string, extension?: string,
 * extensions?: string, inverseKey?: KeyFn, key?: ValueKeyFn, keyMap?:
 * ValueKeyFn, needsSourceValue?: boolean, value?: ValueKeyFn, valueMap?:
 * ValueKeyFn }} MapOptionsDictionary
 *
 * @this {AsyncTree|null}
 * @param {Treelike} source
 * @param {ValueKeyFn|MapOptionsDictionary} operation
 */
export default function map(source, operation) {
  assertScopeIsDefined(this, "map");
  return mapFn.call(this, operation)(source);
}
