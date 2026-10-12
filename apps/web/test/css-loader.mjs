// Server-render tests exercise component markup, while Vite handles global CSS in the app.
export async function load(url, context, nextLoad) {
  if (!new URL(url).pathname.endsWith(".css")) {
    return nextLoad(url, context);
  }

  return {
    format: "module",
    shortCircuit: true,
    source: "export default {};",
  };
}
