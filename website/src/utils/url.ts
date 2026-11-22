/**
 * Helper to ensure paths are cleanly prefixed with the configured base path
 * whether running on GitHub Pages (/seed-db) or on a root custom domain (/).
 */
export function getPath(path: string = "/"): string {
  const rawBase = import.meta.env.BASE_URL || "/";
  const base = rawBase === "/" ? "" : rawBase.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (cleanPath === "/") {
    return base ? `${base}/` : "/";
  }
  return `${base}${cleanPath}`;
}
