import path from "path";
import process from "process";
import { ExplorableApp } from "../../../web/exports.js";

export default function app(relativePath) {
  const resolvedPath = path.resolve(process.cwd(), relativePath);
  return new ExplorableApp(resolvedPath);
}

app.usage = `App([files])\tCreates a basic server app for the given set of files`;
