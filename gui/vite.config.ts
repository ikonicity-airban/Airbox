import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rootChangelogPath = path.resolve(__dirname, "..", "changelog.md");
const rootChangelogContent = fs.existsSync(rootChangelogPath)
  ? fs.readFileSync(rootChangelogPath, "utf-8")
  : "";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "http://localhost:9545",
      "/images": "http://localhost:9545",
      "/marketplace": "http://localhost:9545",
      "/system": "http://localhost:9545",
      "/downloads": "http://localhost:9545",
      "/mal": "http://localhost:9545",
    },
  },
  define: {
    __APP_CHANGELOG__: JSON.stringify(rootChangelogContent),
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom")
          ) {
            return "vendor-react";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
          if (id.includes("node_modules/sweetalert2")) {
            return "vendor-swal";
          }
        },
      },
    },
  },
});
