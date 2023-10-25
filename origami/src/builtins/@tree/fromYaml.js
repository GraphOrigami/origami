import { Tree } from "@graphorigami/core";
import * as serialize from "../../common/serialize.js";
import { treeWithScope } from "../../common/utilities.js";
import assertScopeIsDefined from "../../language/assertScopeIsDefined.js";

/**
 * @typedef {import("@graphorigami/types").AsyncDictionary} AsyncDictionary
 * @typedef {import("@graphorigami/types").AsyncTree} AsyncTree
 * @typedef {import("@graphorigami/core").Treelike} Treelike
 * @typedef {import("../../..").StringLike} StringLike
 *
 * @param {StringLike} text
 * @this {AsyncDictionary|null}
 */
export default async function fromYaml(text) {
  assertScopeIsDefined(this);
  let result = text ? serialize.parseYaml(String(text)) : undefined;
  if (this && Tree.isAsyncTree(result)) {
    result = treeWithScope(result, this);
  }
  return result;
}

fromYaml.usage = `fromYaml <text>\tParse text as YAML`;
fromYaml.documentation = "https://graphorigami.org/cli/builtins.html#fromYaml";
