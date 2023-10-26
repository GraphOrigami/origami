import { Tree } from "@graphorigami/core";
import ConstantTree from "../common/ConstantTree.js";
import { treeWithScope } from "../common/utilities.js";
import assertScopeIsDefined from "../language/assertScopeIsDefined.js";

/**
 * Let a tree (e.g., of files) respond to changes.
 *
 * @typedef {import("@graphorigami/types").AsyncTree} AsyncTree
 * @typedef {import("@graphorigami/core").Treelike} Treelike
 * @typedef {import("../..").Invocable} Invocable
 *
 * @this {AsyncTree|null}
 * @param {Treelike} [treelike]
 * @param {Invocable} [fn]
 */
export default async function watch(treelike, fn) {
  assertScopeIsDefined(this);
  treelike = treelike ?? (await this?.get("@current"));
  if (treelike === undefined) {
    return undefined;
  }

  // Watch the indicated tree.
  /** @type {any} */
  const container = Tree.from(treelike);
  await /** @type {any} */ (container).watch?.();

  // // Watch trees in scope.
  // const scope = /** @type {any} */ (container).scope;
  // await scope?.watch?.();

  if (fn === undefined) {
    return container;
  }

  // The caller supplied a function to reevaluate whenever the tree changes.
  let tree = await evaluateTree(container.scope, fn);

  // We want to return a stable reference to the tree, so we'll use a prototype
  // chain that will always point to the latest tree. We'll extend the tree's
  // prototype chain with an empty object, and use that as a handle (pointer to
  // a pointer) to the tree. This is what we'll return to the caller.
  const handle = Object.create(tree);

  // Reevaluate the function whenever the tree changes.
  container.addEventListener?.("change", async () => {
    const tree = await evaluateTree(container.scope, fn);
    updateIndirectPointer(handle, tree);
  });

  return handle;
}

async function evaluateTree(scope, fn) {
  let tree;
  let message;
  let result;
  try {
    result = await fn.call(scope);
  } catch (error) {
    message = messageForError(error);
  }
  tree = result ? Tree.from(result) : undefined;
  if (tree) {
    return tree;
  }
  if (!message) {
    message = `warning: watch expression did not return a tree`;
  }
  console.warn(message);
  tree = new ConstantTree(message);
  if (scope) {
    tree = treeWithScope(tree, scope);
  }
  return tree;
}

function messageForError(error) {
  let message = "";
  // Work up to the root cause, displaying intermediate messages as we go up.
  while (error.cause) {
    message += error.message + `\n`;
    error = error.cause;
  }
  if (error.name) {
    message += `${error.name}: `;
  }
  message += error.message;
  return message;
}

// Update an indirect pointer to a target.
function updateIndirectPointer(indirect, target) {
  // Clean the pointer of any named properties or symbols that have been set
  // directly on it.
  for (const key of Object.getOwnPropertyNames(indirect)) {
    delete indirect[key];
  }
  for (const key of Object.getOwnPropertySymbols(indirect)) {
    delete indirect[key];
  }

  Object.setPrototypeOf(indirect, target);
}

watch.usage = `@watch <folder>, [expr]\tLet a folder tree respond to changes`;
watch.documentation = "https://graphorigami.org/language/@watch.html";
