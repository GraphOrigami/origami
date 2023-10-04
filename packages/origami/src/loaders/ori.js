/** @typedef {import("@graphorigami/types").AsyncDictionary} AsyncDictionary */
import { Graph } from "@graphorigami/core";
import Scope from "../common/Scope.js";
import { createTextDocument } from "../common/createTextDocument.js";
import { getScope } from "../common/utilities.js";
import * as compile from "../language/compile.js";

/**
 * Load and evaluate an Origami expression from a file.
 *
 * @type {import("../../index.js").Deserializer}
 */
export default async function loadOrigamiExpression(container, input, key) {
  const containerScope = getScope(container);

  // Get the input body text.
  const inputDocument = createTextDocument(input, { parent: container });
  const bodyText = inputDocument.bodyText;

  // Compile the body text as an Origami expression and evaluate it.
  const fn = compile.expression(bodyText);
  let result = await fn.call(containerScope);

  // If the value is a function, wrap it such that it will use the file's
  // container as its scope. Make the calling `this` context available via a
  // `@callScope` ambient.
  if (typeof result === "function") {
    const fn = result;
    /** @this {AsyncDictionary|null} */
    function useContainerScope(input) {
      const extendedScope = new Scope({ "@callScope": this }, containerScope);
      return fn.call(extendedScope, input);
    }

    result = useContainerScope;
    // @ts-ignore
    result.code = fn.code;
  } else if (Graph.isAsyncDictionary(result) && "parent" in result) {
    result.parent = containerScope;
  }

  return result;
}
