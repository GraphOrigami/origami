import ExplorableGraph from "../core/ExplorableGraph.js";
import assertScopeIsDefined from "../language/assertScopeIsDefined.js";

/**
 * Return the top-level keys in the graph.
 *
 * @this {Explorable}
 * @param {GraphVariant} [variant]
 */
export default async function keys(variant) {
  assertScopeIsDefined(this);
  variant = variant ?? (await this?.get("@defaultGraph"));
  if (variant === undefined) {
    return undefined;
  }
  const graph = ExplorableGraph.from(variant);
  return graph.keys();
}

keys.usage = `keys <graph>\tThe top-level keys in the graph`;
keys.documentation = "https://graphorigami.org/cli/builtins.html#keys";
