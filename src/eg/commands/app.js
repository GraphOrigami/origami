import DefaultPages from "../../app/DefaultPages.js";
import MetaMixin from "../../app/MetaMixin.js";
import Compose from "../../common/Compose.js";
import ExplorableGraph from "../../core/ExplorableGraph.js";
import { applyMixinToObject } from "../../core/utilities.js";
import config from "./config.js";

// Start an ExplorableApp
export default async function app(variant = this.graph, ...keys) {
  const graph = ExplorableGraph.from(variant);
  const meta = applyMixinToObject(MetaMixin, graph);
  const baseScope = this?.scope ?? (await config());
  meta.scope = new Compose(meta, baseScope);
  const result = new DefaultPages(meta);
  return keys.length > 0
    ? await ExplorableGraph.traverse(result, ...keys)
    : result;
}

app.usage = `app()\tAn explorable application graph for the current directory`;
