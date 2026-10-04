// Server-render tests exercise component markup, while Vite handles CSS in the app.
// Keep module class names available without emulating browser styles.
export async function load(url, context, nextLoad) {
  if (!new URL(url).pathname.endsWith(".css")) {
    return nextLoad(url, context);
  }

  return {
    format: "module",
    shortCircuit: true,
    source: new URL(url).pathname.endsWith(".module.css")
      ? "export default new Proxy({}, { get: (_target, key) => typeof key === 'string' ? key : undefined });"
      : "export default {};",
  };
}
