import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { packs } from "./vite-plugin-packs.ts";

// Keep in sync with --color-primary (light) and the manifest/theme-color meta in index.html.
const THEME_COLOR = "#0369a1";
const BACKGROUND_COLOR = "#f8fafc";

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    packs({ packsDir: fileURLToPath(new URL("../../packs", import.meta.url)) }),
    VitePWA({
      registerType: "prompt",
      injectRegister: "script",
      filename: "sw.js",
      manifestFilename: "manifest.webmanifest",
      includeAssets: ["icon.svg"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Life Sim",
        short_name: "Life Sim",
        description: "An offline life simulation.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
    }),
  ],
});
