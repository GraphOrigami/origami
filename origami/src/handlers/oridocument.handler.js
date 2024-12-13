import { ObjectTree, symbols } from "@weborigami/async-tree";
import { compile } from "@weborigami/language";
import { parseYaml } from "../common/serialize.js";
import { toString } from "../common/utilities.js";
import { processUnpackedContent } from "../internal.js";
import parseFrontMatter from "./parseFrontMatter.js";

/**
 * An Origami template document: a plain text file that contains Origami
 * expressions.
 */
export default {
  mediaType: "text/plain",

  /** @type {import("@weborigami/language").UnpackFunction} */
  async unpack(packed, options = {}) {
    const parent =
      options.parent ??
      /** @type {any} */ (packed).parent ??
      /** @type {any} */ (packed)[symbols.parent] ??
      null;

    // Unpack as a text document
    const unpacked = toString(packed);

    // See if we can construct a URL to use in error messages
    const name = options.key;
    let url;
    if (name && parent?.url) {
      let parentHref = parent.url.href;
      if (!parentHref.endsWith("/")) {
        parentHref += "/";
      }
      url = new URL(name, parentHref);
    }

    // Determine the data (if present) and text content
    let text;
    let frontData = null;
    let frontSource = null;
    let extendedParent = parent;
    const parsed = parseFrontMatter(unpacked);
    if (!parsed) {
      text = unpacked;
    } else {
      const { body, frontText, isOrigami } = parsed;
      if (isOrigami) {
        // Origami front matter
        frontSource = { name, text: frontText, url };
      } else {
        // YAML front matter
        frontData = parseYaml(frontText);
        if (typeof frontData !== "object") {
          throw new TypeError(`Front matter must be an object`);
        }
        extendedParent = new ObjectTree(frontData);
        extendedParent.parent = parent;
      }
      text = body;
    }

    // Construct an object to represent the source code
    const bodySource = { name, text, url };

    // Compile the source as an Origami template document
    const scopeCaching = frontSource ? false : true;
    const defineTemplateFn = compile.templateDocument(bodySource, {
      scopeCaching,
    });

    // Determine the result of the template
    let result;
    if (frontSource) {
      // Result is the evaluated front source
      const frontFn = compile.expression(frontSource, {
        macros: {
          "@template": defineTemplateFn.code,
        },
      });
      result = await frontFn.call(parent);
    } else {
      const templateFn = await defineTemplateFn.call(extendedParent);
      if (frontData) {
        // Result is a function that adds the front data to the template result
        result = async (input) => {
          const text = await templateFn.call(extendedParent, input);
          const object = {
            ...frontData,
            "@text": text,
          };
          object[symbols.parent] = extendedParent;
          return object;
        };
      } else {
        // Result is a function that calls the body template
        result = templateFn;
      }
    }

    return processUnpackedContent(result, parent);
  },
};
