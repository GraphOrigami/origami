import DefaultValues from "../common/DefaultValues.js";
// import defaultDataflow from "./defaultDataflow.js";
import defaultIndexHtml from "./defaultIndexHtml.js";
import defaultKeysJson from "./defaultKeysJson.js";
// import defaultSvg from "./defaultSvg.js";
// import scopeExplorer from "./scopeExplorer.js";

export default class DefaultPages extends DefaultValues {
  constructor(graph) {
    super(graph, {
      // ".dataflow": defaultDataflow,
      // ".index": defaultIndexHtml,
      ".keys.json": defaultKeysJson,
      // ".scope": scopeExplorer,
      // ".svg": defaultSvg,
      // ".yaml": defaultYamlHtml,
      "index.html": defaultIndexHtml,
    });
  }
}
