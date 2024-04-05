import DeferredTree from "./DeferredTree.js";
import FunctionTree from "./FunctionTree.js";
import MapTree from "./MapTree.js";
import ObjectTree from "./ObjectTree.js";
import SetTree from "./SetTree.js";
import mapTransform from "./transforms/map.js";
import * as utilities from "./utilities.js";
import {
  castArrayLike,
  isPacked,
  isPlainObject,
  isUnpackable,
} from "./utilities.js";

/**
 * Helper functions for working with async trees
 *
 * @typedef {import("../index.ts").PlainObject} PlainObject
 * @typedef {import("../index.ts").ReduceFn} ReduceFn
 * @typedef {import("../index.ts").Treelike} Treelike
 * @typedef {import("../index.ts").ValueKeyFn} ValueKeyFn
 * @typedef {import("@weborigami/types").AsyncMutableTree} AsyncMutableTree
 * @typedef {import("@weborigami/types").AsyncTree} AsyncTree
 */

const treeModule = this;

/**
 * Apply the key/values pairs from the source tree to the target tree.
 *
 * If a key exists in both trees, and the values in both trees are
 * subtrees, then the subtrees will be merged recursively. Otherwise, the
 * value from the source tree will overwrite the value in the target tree.
 *
 * @param {AsyncMutableTree} target
 * @param {AsyncTree} source
 */
export async function assign(target, source) {
  const targetTree = from(target);
  const sourceTree = from(source);
  if (!isAsyncMutableTree(targetTree)) {
    throw new TypeError("Target must be a mutable asynchronous tree");
  }
  // Fire off requests to update all keys, then wait for all of them to finish.
  const keys = Array.from(await sourceTree.keys());
  const promises = keys.map(async (key) => {
    const sourceValue = await sourceTree.get(key);
    if (isAsyncTree(sourceValue)) {
      const targetValue = await targetTree.get(key);
      if (isAsyncMutableTree(targetValue)) {
        // Both source and target are trees; recurse.
        await assign(targetValue, sourceValue);
        return;
      }
    }
    // Copy the value from the source to the target.
    await /** @type {any} */ (targetTree).set(key, sourceValue);
  });
  await Promise.all(promises);
  return targetTree;
}

/**
 * Removes all entries from the tree.
 *
 * @param {AsyncMutableTree} tree
 */
export async function clear(tree) {
  // @ts-ignore
  for (const key of await tree.keys()) {
    await tree.set(key, undefined);
  }
}

/**
 * Returns a new `Iterator` object that contains a two-member array of `[key,
 * value]` for each element in the specific node of the tree.
 *
 * @param {AsyncTree} tree
 */
export async function entries(tree) {
  const keys = Array.from(await tree.keys());
  const promises = keys.map(async (key) => [key, await tree.get(key)]);
  return Promise.all(promises);
}

/**
 * Calls callbackFn once for each key-value pair present in the specific node of
 * the tree.
 *
 * @param {AsyncTree} tree
 * @param {Function} callbackFn
 */
export async function forEach(tree, callbackFn) {
  const keys = Array.from(await tree.keys());
  const promises = keys.map(async (key) => {
    const value = await tree.get(key);
    return callbackFn(value, key);
  });
  await Promise.all(promises);
}

/**
 * Attempts to cast the indicated object to an async tree.
 *
 * @param {Treelike | Object} obj
 * @returns {AsyncTree}
 */
export function from(obj) {
  if (isAsyncTree(obj)) {
    // Argument already supports the tree interface.
    // @ts-ignore
    return obj;
  } else if (typeof obj === "function") {
    return new FunctionTree(obj);
  } else if (obj instanceof Map) {
    return new MapTree(obj);
  } else if (obj instanceof Set) {
    return new SetTree(obj);
  } else if (isPlainObject(obj)) {
    return new ObjectTree(obj);
  } else if (obj && typeof obj === "object" && "unpack" in obj) {
    async function AsyncFunction() {} // Sample async function
    return obj.unpack instanceof AsyncFunction.constructor
      ? // Async unpack: return a deferred tree.
        new DeferredTree(obj.unpack)
      : // Synchronous unpack: cast the result of unpack() to a tree.
        from(obj.unpack());
  } else if (obj && typeof obj === "object") {
    // An instance of some class.
    return new ObjectTree(obj);
  }

  throw new TypeError("Couldn't convert argument to an async tree");
}

/**
 * Returns a boolean indicating whether the specific node of the tree has a
 * value for the given `key`.
 *
 * @param {AsyncTree} tree
 * @param {any} key
 */
export async function has(tree, key) {
  const value = await tree.get(key);
  return value !== undefined;
}

/**
 * Return true if the indicated object is an async tree.
 *
 * @param {any} object
 * @returns {obj is AsyncTree}
 */
export function isAsyncTree(object) {
  return (
    object &&
    typeof object.get === "function" &&
    typeof object.keys === "function"
  );
}

/**
 * Return true if the indicated object is an async mutable tree.
 *
 * @param {any} object
 * @returns {obj is AsyncMutableTree}
 */
export function isAsyncMutableTree(object) {
  return isAsyncTree(object) && typeof object.set === "function";
}

/**
 * Return true if the indicated key produces or is expected to produce an
 * async tree.
 *
 * This defers to the tree's own isKeyForSubtree method. If not found, this
 * gets the value of that key and returns true if the value is an async
 * tree.
 */
export async function isKeyForSubtree(tree, key) {
  if (tree.isKeyForSubtree) {
    return tree.isKeyForSubtree(key);
  }
  const value = await tree.get(key);
  return isAsyncTree(value);
}

/**
 * Return true if the object can be traversed via the `traverse()` method. The
 * object must be either treelike or a packed object with an `unpack()` method.
 *
 * @param {any} object
 */
export function isTraversable(object) {
  return (
    isTreelike(object) ||
    (isPacked(object) && /** @type {any} */ (object).unpack instanceof Function)
  );
}

/**
 * Returns true if the indicated object can be directly treated as an
 * asynchronous tree. This includes:
 *
 * - An object that implements the AsyncTree interface (including
 *   AsyncTree instances)
 * - A function
 * - An `Array` instance
 * - A `Map` instance
 * - A `Set` instance
 * - A plain object
 *
 * Note: the `from()` method accepts any JavaScript object, but `isTreelike`
 * returns `false` for an object that isn't one of the above types.
 *
 * @param {any} object
 * @returns {obj is Treelike}
 */
export function isTreelike(object) {
  return (
    isAsyncTree(object) ||
    object instanceof Function ||
    object instanceof Array ||
    object instanceof Set ||
    isPlainObject(object)
  );
}

/**
 * Return a new tree with deeply-mapped values of the original tree.
 *
 * @param {Treelike} treelike
 * @param {ValueKeyFn} valueFn
 */
export function map(treelike, valueFn) {
  const tree = from(treelike);
  return mapTransform({ deep: true, value: valueFn })(tree);
}

/**
 * Map and reduce a tree.
 *
 * This is done in as parallel fashion as possible. Each of the tree's values
 * will be requested in an async call, then those results will be awaited
 * collectively. If a mapFn is provided, it will be invoked to convert each
 * value to a mapped value; otherwise, values will be used as is. When the
 * values have been obtained, all the values and keys will be passed to the
 * reduceFn, which should consolidate those into a single result.
 *
 * @param {Treelike} treelike
 * @param {ValueKeyFn|null} valueFn
 * @param {ReduceFn} reduceFn
 */
export async function mapReduce(treelike, valueFn, reduceFn) {
  const tree = from(treelike);

  // We're going to fire off all the get requests in parallel, as quickly as
  // the keys come in. We call the tree's `get` method for each key, but
  // *don't* wait for it yet.
  const keys = Array.from(await tree.keys());
  const promises = keys.map((key) =>
    tree.get(key).then((value) =>
      // If the value is a subtree, recurse.
      isAsyncTree(value)
        ? mapReduce(value, valueFn, reduceFn)
        : valueFn
        ? valueFn(value, key, tree)
        : value
    )
  );

  // Wait for all the promises to resolve. Because the promises were captured
  // in the same order as the keys, the values will also be in the same order.
  const values = await Promise.all(promises);

  // Reduce the values to a single result.
  return reduceFn(values, keys);
}

/**
 * Converts an asynchronous tree into a synchronous plain JavaScript object.
 *
 * The result's keys will be the tree's keys cast to strings. Any tree value
 * that is itself a tree will be similarly converted to a plain object.
 *
 * @param {Treelike} treelike
 * @returns {Promise<PlainObject|Array>}
 */
export async function plain(treelike) {
  return mapReduce(treelike, null, (values, keys) => {
    const object = {};
    for (let i = 0; i < keys.length; i++) {
      object[keys[i]] = values[i];
    }
    return castArrayLike(object);
  });
}

/**
 * Removes the value for the given key from the specific node of the tree.
 *
 * Note: The corresponding `Map` method is `delete`, not `remove`. However,
 * `delete` is a reserved word in JavaScript, so this uses `remove` instead.
 *
 * @param {AsyncMutableTree} tree
 * @param {any} key
 */
export async function remove(tree, key) {
  const exists = await has(tree, key);
  if (exists) {
    await tree.set(key, undefined);
    return true;
  } else {
    return false;
  }
}

/**
 * Returns a function that invokes the tree's `get` method.
 *
 * @param {Treelike} treelike
 * @returns {Function}
 */
export function toFunction(treelike) {
  const tree = from(treelike);
  return tree.get.bind(tree);
}

/**
 * Return the value at the corresponding path of keys.
 *
 * @this {any}
 * @param {Treelike} treelike
 * @param {...any} keys
 */
export async function traverse(treelike, ...keys) {
  try {
    // Await the result here so that, if the path doesn't exist, the catch
    // block below will catch the exception.
    return await traverseOrThrow.call(this, treelike, ...keys);
  } catch (/** @type {any} */ error) {
    if (error instanceof TraverseError) {
      return undefined;
    } else {
      throw error;
    }
  }
}

/**
 * Return the value at the corresponding path of keys. Throw if any interior
 * step of the path doesn't lead to a result.
 *
 * @this {AsyncTree|null|undefined}
 * @param {Treelike} treelike
 * @param  {...any} keys
 */
export async function traverseOrThrow(treelike, ...keys) {
  if (!treelike) {
    throw new TraverseError("Tried to traverse a null or undefined value");
  }

  // Start our traversal at the root of the tree.
  /** @type {any} */
  let value = treelike;

  // If traversal operation was called with a `this` context, use that as the
  // target for function calls.
  const target = this === treeModule ? undefined : this;

  // Process all the keys.
  const remainingKeys = keys.slice();
  let key;
  while (remainingKeys.length > 0) {
    if (value === undefined) {
      // Attempted to traverse an undefined value
      const message = key
        ? `${key} does not exist`
        : `Couldn't traverse the path: ${keys
            .map((key) => String(key))
            .join("/")}`;
      throw new TraverseError(message, treelike, keys);
    }

    // If the value is packed and can be unpacked, unpack it.
    if (isUnpackable(value)) {
      value = await value.unpack();
    }

    // Peek ahead: if there's only one key left and it's an empty string, return
    // the value itself.
    if (remainingKeys.length === 1 && remainingKeys[0] === "") {
      return value;
    } else if (value instanceof Function) {
      // Value is a function: call it with the remaining keys.
      const fn = value;
      // We'll take as many keys as the function's length, but at least one.
      let fnKeyCount = Math.max(fn.length, 1);
      const args = remainingKeys.splice(0, fnKeyCount);
      key = null;
      value = await fn.call(target, ...args);
    } else {
      // Value is some other treelike object: cast it to a tree.
      const tree = from(value);
      // Get the next key.
      key = remainingKeys.shift();
      // Get the value for the key.
      value = await tree.get(key);
    }
  }

  return value;
}

/**
 * Given a slash-separated path like "foo/bar", traverse the keys "foo" and
 * "bar" and return the resulting value.
 *
 * @param {Treelike} tree
 * @param {string} path
 */
export async function traversePath(tree, path) {
  const keys = utilities.keysFromPath(path);
  return traverse(tree, ...keys);
}

// Error class thrown by traverseOrThrow()
class TraverseError extends ReferenceError {
  constructor(message, tree, keys) {
    super(message);
    this.tree = tree;
    this.name = "TraverseError";
    this.keys = keys;
  }
}

/**
 * Return the values in the specific node of the tree.
 *
 * @param {AsyncTree} tree
 */
export async function values(tree) {
  const keys = Array.from(await tree.keys());
  const promises = keys.map(async (key) => tree.get(key));
  return Promise.all(promises);
}
