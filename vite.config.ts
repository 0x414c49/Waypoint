import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "client",
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4174",
        changeOrigin: false,
      },
    },
  },
});
