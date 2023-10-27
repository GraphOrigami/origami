import FilterTree from "../common/FilterTree.js";
import assertScopeIsDefined from "../misc/assertScopeIsDefined.js";
import Scope from "../runtime/Scope.js";

/**
 * Apply a filter to a tree.
 *
 * @typedef  {import("@graphorigami/types").AsyncTree} AsyncTree
 * @typedef {import("@graphorigami/core").Treelike} Treelike
 * @this {AsyncTree|null}
 * @param {Treelike} treelike
 * @param {Treelike} filterVariant
 */
export default async function filter(treelike, filterVariant) {
  assertScopeIsDefined(this);
  /** @type {AsyncTree} */
  let result = new FilterTree(treelike, filterVariant);
  result = Scope.treeWithScope(result, this);
  return result;
}

filter.usage = `@filter <tree>, <filter>\tOnly returns values whose keys match the filter`;
filter.documentation = "https://graphorigami.org/language/@filter.html";
