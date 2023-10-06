import { Dictionary, Graph } from "@graphorigami/core";
import { getScope, transformObject } from "../../common/utilities.js";
import defaultKeysJson from "../../framework/defaultKeysJson.js";
import assertScopeIsDefined from "../../language/assertScopeIsDefined.js";

/**
 * Expose .keys.json for a graph.
 *
 * @typedef {import("@graphorigami/types").AsyncDictionary} AsyncDictionary
 * @typedef {import("@graphorigami/core").Graphable} Graphable
 * @this {AsyncDictionary|null}
 * @param {Graphable} graphable
 */
export default async function keysJson(graphable) {
  assertScopeIsDefined(this);
  graphable = graphable ?? (await this?.get("@current"));
  if (graphable === undefined) {
    return undefined;
  }
  const graph = Graph.from(graphable);
  const result = transformObject(KeysJsonTransform, graph);
  return result;
}

function KeysJsonTransform(Base) {
  return class Static extends Base {
    async get(key) {
      let value = await super.get(key);
      if (value === undefined && key === ".keys.json") {
        const scope = getScope(this);
        value = defaultKeysJson.call(scope, this);
      } else if (Dictionary.isAsyncDictionary(value)) {
        value = transformObject(KeysJsonTransform, value);
      }
      return value;
    }

    async keys() {
      const keys = new Set(await super.keys());
      keys.add(".keys.json");
      return keys;
    }
  };
}
