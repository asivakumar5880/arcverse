import { defineConfig } from "vite";
import { adminAuthPlugin } from "./server/adminAuth.js";

// Multi-page build: roll up anime.html alongside index.html.
export default defineConfig({
  plugins: [adminAuthPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: new URL("./index.html", import.meta.url).pathname,
        anime: new URL("./anime.html", import.meta.url).pathname,
        login: new URL("./login.html", import.meta.url).pathname,
      },
    },
  },
});
