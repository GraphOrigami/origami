import path from "path";
import * as YAMLModule from "yaml";
import builtins from "../cli/builtins.js";
import ExplorableGraph from "../core/ExplorableGraph.js";
import { transformObject } from "../core/utilities.js";
import { isFormulasTransformApplied } from "../framework/FormulasTransform.js";
// import { additionsPrefix } from "../framework/AdditionsTransform.js";
import MetaTransform from "../framework/MetaTransform.js";
import * as ops from "../language/ops.js";
import CommandsModulesTransform from "../node/CommandModulesTransform.js";

// See notes at ExplorableGraph.js
// @ts-ignore
const YAML = YAMLModule.default ?? YAMLModule.YAML;

const commands = transformObject(CommandsModulesTransform, builtins);

const ignoreKeys = await ExplorableGraph.keys(commands);
ignoreKeys.push(".");
ignoreKeys.push("..");
ignoreKeys.push(ops.thisKey);

export default async function dataflow(variant) {
  let graph = ExplorableGraph.from(variant);
  if (!isFormulasTransformApplied(graph)) {
    graph = transformObject(MetaTransform, graph);
  }

  const flowFile = await graph.get(".dataflow.yaml");
  const flow = ExplorableGraph.isExplorable(flowFile)
    ? await ExplorableGraph.plain(flowFile)
    : flowFile
    ? YAML.parse(String(flowFile))
    : {};

  // Determine what keys are relevant to this graph,
  let keysInScope = await getKeysInScope(graph);
  if (flowFile) {
    // Add it any keys defined by the flow file.
    keysInScope = unique(keysInScope, Object.keys(flow));
  }

  const formulas = await /** @type {any} */ (graph).formulas();

  await addFormulaDependencies(flow, keysInScope, formulas);
  await addContentDependencies(flow, graph, keysInScope);

  addImplicitJavaScriptDependencies(flow, keysInScope);
  markUndefinedDependencies(flow, keysInScope);

  return flow;
}

async function addContentDependencies(flow, graph, keysInScope) {
  for await (const key of graph) {
    const extension = path.extname(key);
    const dependencyParsers = {
      ".html": htmlDependencies,
      ".meta": metaDependencies,
      ".ori": origamiTemplateDependencies,
    };
    const parser = dependencyParsers[extension];
    if (parser) {
      const value = await graph.get(key);
      let dependencies = await parser(value, keysInScope);

      // Only consider the dependencies that are in scope.
      dependencies = dependencies.filter((dependency) =>
        keysInScope.includes(dependency)
      );

      updateFlowRecord(flow, key, { dependencies });

      // Also add the dependencies as nodes in the dataflow.
      dependencies.forEach((dependency) => {
        updateFlowRecord(flow, dependency, {});
      });
    }
  }
}

async function addFormulaDependencies(flow, keysInScope, formulas) {
  for (const formula of formulas) {
    const { key, expression, source } = formula;
    const dependencies = expression
      ? codeDependencies(expression, keysInScope)
      : null;

    if (dependencies?.length === 0) {
      // All dependencies are builtins.
      // Use the RHS of the formula as the dependency.
      const parts = source.split("=");
      const rhs = parts[parts.length - 1]?.trim();
      if (rhs) {
        updateFlowRecord(flow, key, {
          dependencies: [source],
        });
        updateFlowRecord(flow, source, {
          label: rhs,
        });
      } else {
        // Formula is not an assignment.
      }
    } else if (dependencies) {
      // We have at least some dependencies on other values in the graph (not
      // builtins).
      updateFlowRecord(flow, key, { dependencies });

      // Also add the dependencies as nodes in the dataflow.
      dependencies.forEach((dependency) => {
        updateFlowRecord(flow, dependency, {});
      });
    }
  }
}

// If there's a dependency on `foo`, and `foo` isn't defined, but `foo.js`
// is, then add an implicit dependency for `foo` on `foo.js`.
function addImplicitJavaScriptDependencies(flow, keysInScope) {
  for (const [_, record] of Object.entries(flow)) {
    const dependencies = record.dependencies ?? [];
    for (const dependency of dependencies) {
      if (path.extname(dependency) === ".js") {
        continue;
      }
      const dependencyJsKey = `${dependency}.js`;
      if (!flow[dependencyJsKey] && keysInScope.includes(dependencyJsKey)) {
        updateFlowRecord(flow, dependency, {
          dependencies: [dependencyJsKey],
        });
        updateFlowRecord(flow, dependencyJsKey, {});
      }
    }
  }
}

function codeDependencies(code, keysInScope, onlyDependenciesInScope = false) {
  if (code instanceof Array) {
    if (code[0] === ops.scope) {
      const key = code[1];
      const ignore =
        ignoreKey(key) ||
        (onlyDependenciesInScope && !keysInScope.includes(key));
      return ignore ? [] : [key];
    } else {
      const limitDependencies =
        onlyDependenciesInScope || code[0] === ops.lambda;
      return code.flatMap((instruction) =>
        codeDependencies(instruction, keysInScope, limitDependencies)
      );
    }
  } else {
    return [];
  }
}

async function getKeysInScope(graph) {
  // HACK: Presume that scope is a Scope object.
  const scopeGraphs = graph.scope?.graphs ?? [graph];
  let keysInScope = [];
  for (const scopeGraph of scopeGraphs) {
    const scopeGraphKeys = await (scopeGraph.allKeys?.() ??
      ExplorableGraph.keys(scopeGraph));
    keysInScope.push(...scopeGraphKeys);
  }

  // For any key `foo.js`, add `foo` as a key in scope.
  const jsKeys = keysInScope.filter((key) => path.extname(key) === ".js");
  const commandKeys = jsKeys.map((jsKey) => path.basename(jsKey, ".js"));
  keysInScope.push(...commandKeys);

  // Remove any keys that should be ignored.
  keysInScope = keysInScope.filter((key) => !ignoreKey(key));

  return unique(keysInScope);
}

function ignoreKey(key) {
  // HACK: instead of `instanceof Array` to catch ops.thisKey,
  // have parser stop wrapping ops.thisKey in an array.
  if (key instanceof Array) {
    return true;
  } else if (key.startsWith?.("@")) {
    return true;
  }
  return ignoreKeys.includes(key);
}

async function htmlDependencies(html, keysInScope) {
  // HACK: Use a regex to find img src attributes.
  // TODO: Use a real HTML parser.
  const imgSrcRegex = /<img[\s\S]+?src="(?<src>.+)"[\s\S]+?\/?>/g;
  const matches = [...html.matchAll(imgSrcRegex)];
  const srcs = matches.map((match) => match.groups.src);

  // Take first part of the src path that isn't a "." or "..".
  const pathHeads = srcs.map((src) => {
    const parts = src.split("/");
    if (parts.length === 0) {
      return src;
    }
    while (parts[0] === "." || parts[0] === "..") {
      parts.shift();
    }
    return parts[0];
  });

  // Only return path heads that are in scope.
  const pathHeadsInScope = pathHeads.filter((pathHead) =>
    keysInScope.includes(pathHead)
  );

  return pathHeadsInScope;
}

function markUndefinedDependencies(flow, keysInScope) {
  for (const record of Object.values(flow)) {
    record.dependencies?.forEach((dependency) => {
      if (!keysInScope.includes(dependency)) {
        const dependencyRecord = flow[dependency];
        if (dependencyRecord) {
          dependencyRecord.undefined = true;
        }
      }
    });
  }
}

async function metaDependencies(meta, keysInScope) {
  return [];
}

async function origamiTemplateDependencies(template, keysInScope) {
  let dependencies = [];
  if (!template.code) {
    await template.compile();
    dependencies = codeDependencies(template.code, keysInScope);
  }

  // If the template appears to contain HTML, add the HTML dependencies.
  // HACK: Crude heuristic just sees if the first non-space is a "<".
  if (template.text.trim().startsWith("<")) {
    dependencies = dependencies.concat(
      await htmlDependencies(template.text, keysInScope)
    );
  }

  return dependencies;
}

function updateFlowRecord(flow, key, record) {
  const existingRecord = flow[key];

  if (!existingRecord) {
    flow[key] = record;
  }

  // Merge and de-dupe dependencies.
  const dependencies = unique(
    existingRecord?.dependencies,
    record?.dependencies
  );
  if (dependencies.length > 0) {
    flow[key].dependencies = dependencies;
  }
}

function unique(array1 = [], array2 = []) {
  return [...new Set([...array1, ...array2])];
}
