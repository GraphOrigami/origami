import {
  ObjectTree,
  Tree,
  isPlainObject,
  isStringLike,
  keysFromPath,
} from "@weborigami/async-tree";
import { Scope, extname } from "@weborigami/language";
import * as serialize from "../common/serialize.js";
import { toString } from "../common/utilities.js";
import { mediaTypeForExtension, mediaTypeIsText } from "./mediaTypes.js";

const TypedArray = Object.getPrototypeOf(Uint8Array);

// Extend the tree's scope with the URL's search parameters.
function extendTreeScopeWithParams(tree, url) {
  // Create a tree that includes the URL's search parameters.
  const params = {};
  for (const [key, value] of url.searchParams) {
    params[key] = value;
  }

  if (Object.keys(params).length === 0) {
    // No search parameters, so return the tree as is.
    return tree;
  }

  const paramTree = new ObjectTree({
    "@params": params,
  });

  // Create a new scope that includes search parameter tree.
  const newScope = new Scope(paramTree, tree.parent);

  // Create a new tree that extends the prototype chain of the supplied tree.
  const extendedTree = Scope.treeWithScope(tree, newScope);

  return extendedTree;
}

// Asynchronous tree router as Express middleware.
export function treeRouter(tree) {
  // Return a router for the tree source.
  return async function (request, response, next) {
    const handled = await handleRequest(request, response, tree);
    if (!handled) {
      // Module not found, let next middleware function try.
      next();
    }
  };
}

export async function handleRequest(request, response, tree) {
  // For parsing purposes, we assume HTTPS -- it doesn't affect parsing.
  const url = new URL(request.url, `https://${request.headers.host}`);

  // Split on occurrences of `/!`, which represent Origami debug commands.
  // Command arguments can contain slashes; don't treat those as path keys.
  const parts = url.pathname.split(/\/!/);
  const keys = parts.flatMap((part, index) => {
    const decoded = decodeURIComponent(part);
    // Split keys that aren't commands; add back the `!` to commands.
    return index % 2 === 0 ? keysFromPath(decoded) : `!${decoded}`;
  });

  // If the path ends with a trailing slash, the final key will be an empty
  // string. Change that to "index.html".
  if (keys[keys.length - 1] === "") {
    keys[keys.length - 1] = "index.html";
  }

  const extendedTree =
    url.searchParams && "parent" in tree
      ? extendTreeScopeWithParams(tree, url)
      : tree;

  // Ask the tree for the resource with those keys.
  let resource;
  try {
    resource = await Tree.traverse(extendedTree, ...keys);
    // If resource is a function, invoke to get the object we want to return.
    if (typeof resource === "function") {
      resource = await resource();
    }
  } catch (/** @type {any} */ error) {
    respondWithError(response, error);
    return true;
  }

  let mediaType;

  if (!resource) {
    return false;
  }

  // Determine media type, what data we'll send, and encoding.
  const extension = extname(url.pathname).toLowerCase();
  mediaType = extension ? mediaTypeForExtension[extension] : undefined;

  if (
    mediaType === undefined &&
    !request.url.endsWith("/") &&
    (Tree.isAsyncTree(resource) ||
      isPlainObject(resource) ||
      resource instanceof Array)
  ) {
    // Redirect to an index page for the result.
    // Redirect to the root of the tree.
    const Location = `${request.url}/`;
    response.writeHead(307, { Location });
    response.end("ok");
    return true;
  }

  // If the request is for a JSON or YAML result, and the resource we got
  // isn't yet a string or Buffer, convert the resource to JSON or YAML now.
  if (
    (mediaType === "application/json" || mediaType === "text/yaml") &&
    !isStringLike(resource)
  ) {
    const tree = Tree.from(resource);
    resource =
      mediaType === "text/yaml"
        ? await serialize.toYaml(tree)
        : await serialize.toJson(tree);
  } else if (
    mediaType === undefined &&
    (isPlainObject(resource) || resource instanceof Array)
  ) {
    // The resource is data, try showing it as YAML.
    const tree = Tree.from(resource);
    resource = await serialize.toYaml(tree);
    mediaType = "text/yaml";
  }

  let data;
  if (mediaType) {
    data = mediaTypeIsText[mediaType] ? toString(resource) : resource;
  } else {
    data = textOrObject(resource);
  }

  if (!mediaType) {
    // Can't identify media type; infer default type.
    mediaType =
      typeof data !== "string"
        ? "application/octet-stream"
        : data.trimStart().startsWith("<")
        ? "text/html"
        : "text/plain";
  }
  const encoding = mediaTypeIsText[mediaType] ? "utf-8" : undefined;

  // If we didn't get back some kind of data that response.write() accepts,
  // assume it was an error.
  const validResponse = typeof data === "string" || data instanceof TypedArray;

  if (!validResponse) {
    const typeName = data?.constructor?.name ?? typeof data;
    console.error(
      `A served tree must return a string or a TypedArray (such as a Buffer) but returned an instance of ${typeName}.`
    );
    return false;
  }

  response.writeHead(200, {
    "Content-Type": mediaType,
  });
  try {
    response.end(data, encoding);
  } catch (/** @type {any} */ error) {
    console.error(error.message);
    return false;
  }

  return true;
}

/**
 * A request listener for use with the node http.createServer and
 * https.createServer calls, letting you serve an async tree as a set of pages.
 *
 * @typedef {import("@weborigami/async-tree").Treelike} Treelike
 * @param {Treelike} treelike
 */
export function requestListener(treelike) {
  const tree = Tree.from(treelike);
  return async function (request, response) {
    console.log(decodeURI(request.url));
    const handled = await handleRequest(request, response, tree);
    if (!handled) {
      // Ignore exceptions that come up with sending a Not Found response.
      try {
        response.writeHead(404, { "Content-Type": "text/html" });
        response.end(`Not found`, "utf-8");
      } catch (error) {}
    }
  };
}

/**
 * Construct a page in response in the given error, and also show the error in
 * the console.
 */
function respondWithError(response, error) {
  let message = "";
  // Work up to the root cause, displaying intermediate messages as we go up.
  while (error.cause) {
    message += error.message + `\n`;
    error = error.cause;
  }
  if (error.name) {
    message += `${error.name}: `;
  }
  message += error.message;
  // Prevent HTML in the error message from being interpreted as HTML.
  message = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html>
<html>
<head>
<title>Error: ${error.message}</title>
</head>
<body>
<h1>Error</h1>
<pre><code>
${message}
</code></pre>
</body>
</html>
`;
  response.writeHead(404, { "Content-Type": "text/html" });
  response.end(html, "utf-8");
  console.error(message);
}

/**
 * Convert to a string if we can, but leave objects that convert to something
 * like "[object Object]" alone.
 *
 * @param {any} object
 */
function textOrObject(object) {
  // Return buffers and typed arrays as is.
  if (object instanceof ArrayBuffer || object instanceof TypedArray) {
    return object;
  }
  return toString(object);
}
