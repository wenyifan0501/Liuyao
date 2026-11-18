import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  // web:local passes its chosen port and sets API_PORT; plain `npm run web:dev` keeps 5173 → 3000.
  server: { host: "localhost", port: 5173, strictPort: true, proxy: { "/api": `http://127.0.0.1:${process.env.API_PORT ?? 3000}` } },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
