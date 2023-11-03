import {
  cachedKeysTransform,
  createExtensionKeyFns,
  Tree,
} from "@graphorigami/async-tree";
import { Scope } from "@graphorigami/language";
import addValueKeyToScope from "../../common/addValueKeyToScope.js";
import { toFunction } from "../../common/utilities.js";

/**
 *
 * @typedef {import("@graphorigami/async-tree").KeyMapFn} KeyMapFn
 * @typedef {import("@graphorigami/async-tree").ValueMapFn} ValueMapFn
 *
 * @this {import("@graphorigami/types").AsyncTree|null}
 * @param {{ deep?: boolean, description?: string, extensions?: string, innerKeyFn?: KeyMapFn, keyFn?: KeyMapFn, valueFn?: ValueMapFn }} options
 */
export default function treeMap({
  deep,
  description = "@tree/map",
  extensions,
  innerKeyFn,
  keyFn,
  valueFn,
}) {
  if (extensions) {
    if (keyFn || innerKeyFn) {
      throw new TypeError(
        `@tree/map: You can't specify both extensions and a keyFn or innerKeyFn`
      );
    }
  }

  const baseScope = Scope.getScope(this);

  // Extend the value function to include the value and key in scope.
  let extendedValueFn;
  if (valueFn) {
    const resolvedValueFn = toFunction(valueFn);
    extendedValueFn = function (innerValue, innerKey, tree) {
      const scope = addValueKeyToScope(baseScope, innerValue, innerKey);
      return resolvedValueFn.call(scope, innerValue, innerKey, tree);
    };
  }

  // Extend the key function to include the value and key in scope.
  let extendedKeyFn;
  if (extensions) {
    let { extension, innerExtension } = parseExtensions(extensions);
    const keyFns = createExtensionKeyFns({
      deep,
      extension,
      innerExtension,
    });
    extendedKeyFn = keyFns.keyFn;
  } else if (keyFn) {
    const resolvedKeyFn = toFunction(keyFn);
    extendedKeyFn = async function (innerKey, tree) {
      const innerValue = await tree.get(innerKey);
      const scope = addValueKeyToScope(baseScope, innerValue, innerKey);
      // Note that treeMap includes the *value* in the arguments to the key
      // function. This allows a key function to be defined with an Origami
      // lambda.
      const outerKey = await resolvedKeyFn.call(
        scope,
        innerValue,
        innerKey,
        tree
      );
      return outerKey;
    };
  }

  return function map(treelike) {
    const tree = Tree.from(treelike);
    return cachedKeysTransform({
      deep,
      description,
      keyFn: extendedKeyFn,
      valueFn: extendedValueFn,
    })(tree);
  };
}

/**
 * Given a string specifying an extension or a mapping of one extension to another,
 * return the inner and outer extensions.
 *
 * Syntax:
 *   foo
 *   foo→bar      Unicode Rightwards Arrow
 *   foo->bar     hyphen and greater-than sign
 *
 * @param {string} specifier
 */
function parseExtensions(specifier) {
  const lowercase = specifier?.toLowerCase() ?? "";
  const extensionRegex =
    /^\.?(?<innerExtension>\S*)(?:\s*(→|->)\s*)\.?(?<extension>\S+)$/;
  let extension;
  let innerExtension;
  const match = lowercase.match(extensionRegex);
  if (match?.groups) {
    // foo→bar
    ({ extension, innerExtension } = match.groups);
  } else {
    // foo
    extension = lowercase;
    innerExtension = lowercase;
  }
  return { extension, innerExtension };
}
