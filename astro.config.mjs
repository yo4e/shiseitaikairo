import { defineConfig } from "astro/config";

const apiProxyTarget = process.env.ASTRO_API_PROXY_TARGET || "http://127.0.0.1:8787";

export default defineConfig({
  output: "static",
  vite: {
    server: {
      proxy: {
        "/api": apiProxyTarget,
      },
    },
  },
});
