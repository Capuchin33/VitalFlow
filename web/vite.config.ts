import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Pages set VITE_BASE=/repo-name/ (e.g. /VitalFlow/)
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/",
});
