import compression from "compression";
import express, { type Express } from "express";
import path from "path";

const ONE_YEAR_MS = 31_536_000_000;

/**
 * Mount immutable, compressed build assets without caching the SPA document.
 * Vite fingerprints files under dist/assets, so they are safe to cache for a year.
 */
export function mountProductionStaticAssets(app: Express, distDir = path.join(process.cwd(), "dist")) {
  app.use(compression());
  app.use(
    "/assets",
    express.static(path.join(distDir, "assets"), {
      immutable: true,
      maxAge: ONE_YEAR_MS,
    }),
  );
  app.use(express.static(distDir, { index: false, maxAge: 0 }));
}
