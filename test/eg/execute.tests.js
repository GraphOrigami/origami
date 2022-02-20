import ExplorableGraph from "../../src/core/ExplorableGraph.js";
import ExplorableObject from "../../src/core/ExplorableObject.js";
import execute from "../../src/eg/execute.js";
import * as ops from "../../src/eg/ops.js";
import assert from "../assert.js";

describe("execute", () => {
  it("can execute", async () => {
    // Match the array representation of code generated by the parser.
    const code = [
      [ops.scope, "greet"],
      [ops.scope, "name"],
    ];

    const graph = new ExplorableObject({
      async greet(name) {
        return `Hello ${name}`;
      },
      name: "world",
    });
    const result = await execute.call(graph, code);
    assert.equal(result, "Hello world");
  });

  it("can resolve substitutions in a template literal", async () => {
    const graph = new ExplorableObject({
      name: "world",
    });

    const code = [ops.concat, "Hello, ", [ops.scope, "name"], "."];

    const result = await execute.call(graph, code);
    assert.equal(result, "Hello, world.");
  });

  // TODO:create ops.tests.js
  it("can invoke a lambda", async () => {
    const graph = new ExplorableObject({
      name: "world",
    });

    const code = [
      ops.lambda,
      [ops.concat, "Hello, ", [ops.scope, "name"], "."],
    ];

    const fn = await execute.call(graph, code);
    const result = await fn(graph);
    assert.equal(result, "Hello, world.");
  });

  it("concat can concatenate graph values", async () => {
    const graph = ExplorableGraph.from(["a", "b", "c"]);
    const result = await ops.concat(graph);
    assert.equal(result, "abc");
  });
});
