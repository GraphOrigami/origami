import { Graph, ObjectGraph } from "@graphorigami/core";
import assert from "node:assert";
import { describe, test } from "node:test";
import loadTextWithFrontMatter from "../../src/common/loadTextWithFrontMatter.js";
describe("loadTextWithFrontMatter", () => {
  test("returns plain text input as is", () => {
    const result = loadTextWithFrontMatter.call(null, "text");
    assert.equal(result, "text");
  });

  test("attaches YAML/JSON front matter as a graph", async () => {
    const text = `---
a: 1
---
text`;
    const textFile = await loadTextWithFrontMatter.call(null, text);
    assert.equal(String(textFile), text);
    const graph = /** @type {any} */ (textFile).contents();
    assert.deepEqual(await Graph.plain(graph), { a: 1 });
  });

  test("passes along an attached graph if no front matter", async () => {
    /** @type {any} */
    const input = new String("text");
    input.contents = () => new ObjectGraph({ a: 1 });
    const textFile = await loadTextWithFrontMatter.call(null, input);
    assert.equal(String(textFile), "text");
    const graph = /** @type {any} */ (textFile).contents();
    assert.deepEqual(await Graph.plain(graph), { a: 1 });
  });
});
