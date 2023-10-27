import { Tree } from "@graphorigami/core";
import assertScopeIsDefined from "../../misc/assertScopeIsDefined.js";
import Scope from "../../runtime/Scope.js";

/**
 * Return only the defined (not `undefined`) values in the tree.
 *
 * @typedef  {import("@graphorigami/types").AsyncTree} AsyncTree
 * @typedef {import("@graphorigami/core").Treelike} Treelike
 *
 * @this {AsyncTree|null}
 * @param {Treelike} treelike
 */
export default async function defineds(treelike) {
  assertScopeIsDefined(this);
  treelike = treelike ?? (await this?.get("@current"));
  if (treelike === undefined) {
    throw new TypeError("A tree treelike is required");
  }

  /** @type {AsyncTree} */
  let result = await Tree.mapReduce(treelike, null, (values, keys) => {
    const result = {};
    let someValuesExist = false;
    for (let i = 0; i < keys.length; i++) {
      const value = values[i];
      if (value != null) {
        someValuesExist = true;
        result[keys[i]] = values[i];
      }
    }
    return someValuesExist ? result : null;
  });

  result = Scope.treeWithScope(result, this);
  return result;
}
