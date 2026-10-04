import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

/** Execute the actual route handler with isolated dependencies, never importing
 * production pool/auth modules. A source override also supports baseline runs. */
export async function loadRouteHandlers<T>({
  path,
  source,
  modules,
  logger = console,
}: {
  path: string | URL;
  source?: string;
  modules: Record<string, unknown>;
  logger?: Pick<Console, "error" | "log" | "warn">;
}): Promise<T> {
  const { outputText } = ts.transpileModule(source ?? await readFile(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const module = {
    exports: {} as { Route?: { options: { server: { handlers: T } } } },
  };

  runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "@tanstack/react-router") {
        return { createFileRoute: () => (options: unknown) => ({ options }) };
      }
      if (!Object.hasOwn(modules, specifier)) {
        throw new Error(`Route test dependency not supplied: ${specifier}`);
      }
      return modules[specifier];
    },
    URL,
    Date,
    Promise,
    Response,
    Request,
    console: logger,
  }, { filename: String(path) });

  if (!module.exports.Route) throw new Error(`No Route exported by ${path}`);
  return module.exports.Route.options.server.handlers;
}
