import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",

      manifest: {
        name: "MIYAMA Maintenance",
        short_name: "MIYAMA",
        description: "設備保全管理アプリ",
        theme_color: "#2563eb",
        background_color: "#f6f8fb",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",

        icons: [
          {
            src: "/miyama-logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },

      devOptions: {
        enabled: true,
      },
    }),
  ],
});