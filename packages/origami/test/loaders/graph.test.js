import { Graph } from "@graphorigami/core";
import assert from "node:assert";
import { describe, test } from "node:test";
import loadGraph from "../../src/loaders/graph.js";

describe(".graph loader", () => {
  test("loads a file as an Origami graph", async () => {
    const text = `
      name = 'world'
      message = \`Hello, {{ name }}!\`
    `;
    const graphFile = await loadGraph.call(null, text);
    const graph = await /** @type {any} */ (graphFile).contents();
    assert.deepEqual(await Graph.plain(graph), {
      name: "world",
      message: "Hello, world!",
    });
  });
});
