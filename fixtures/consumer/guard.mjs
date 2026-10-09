import { registerHooks } from "node:module";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const workspace = realpathSync(path.dirname(fileURLToPath(import.meta.url))) + path.sep;
registerHooks({ resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  if (result.url.startsWith("file:")) {
    const actual = realpathSync(fileURLToPath(result.url));
    if (!actual.startsWith(workspace)) throw new Error("Runtime escaped isolated installed workspace: " + specifier);
  } else if (!result.url.startsWith("node:")) throw new Error("Unsupported consumer runtime protocol: " + result.url);
  return result;
} });
