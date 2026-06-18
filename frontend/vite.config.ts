import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      // Forward API calls to the FastAPI backend during local dev.
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
