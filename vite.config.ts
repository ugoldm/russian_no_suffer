import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || "/",
    server: {
      port: 5173,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:5174" },
    },
    build: { sourcemap: false },
  };
});
