import Compose from "../common/Compose.js";

export default async function compose(...graphs) {
  return new Compose(...graphs);
}

compose.usage = `compose <...graphs>\tCompose the given graphs`;
compose.documentation = "https://graphorigami.org/cli/builtins.html#compose";
