import assert from "node:assert";
import { describe, test } from "node:test";

import { GraphHelpers, ObjectGraph } from "@graphorigami/core";
import DeferredGraph from "../../src/common/DeferredGraph.js";
describe("DeferredGraph", () => {
  test("Loads graph lazily", async () => {
    const graph = new DeferredGraph(async () => {
      return new ObjectGraph({
        a: 1,
        b: 2,
      });
    });
    assert.deepEqual(await GraphHelpers.plain(graph), {
      a: 1,
      b: 2,
    });
  });
});
