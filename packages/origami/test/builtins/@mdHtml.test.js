import { Graph } from "@graphorigami/core";
import assert from "node:assert";
import { describe, test } from "node:test";
import mdHtml from "../../src/builtins/@mdHtml.js";
import {
  default as loadTextWithFrontMatter,
  default as md,
} from "../../src/loaders/md.js";

describe("mdHtml", () => {
  test("transforms markdown to HTML", async () => {
    const markdown = `# Hello, world.`;
    const html = await mdHtml(markdown);
    assert.equal(html, `<h1 id="hello-world">Hello, world.</h1>\n`);
  });

  test("HTML contents include the source contents and the HTML", async () => {
    const textFile = loadTextWithFrontMatter.call(
      null,
      `---
title: Hello
---
# Hello, world.`
    );
    const markdownFile = md.call(null, textFile);
    const htmlFile = await mdHtml.call(null, markdownFile);
    const html = String(htmlFile);
    assert.equal(html, `<h1 id="hello-world">Hello, world.</h1>\n`);
    const graph = await htmlFile.contents();
    assert.deepEqual(await Graph.plain(graph), {
      title: "Hello",
    });
    assert.equal(await graph.get(Graph.defaultValueKey), html);
  });
});
