import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import baseConfig from "../vite.config.js";
export default defineConfig(args => {
  const base = baseConfig(args);
  return {
    ...base,
    resolve: { ...base.resolve, alias: { "@": fileURLToPath(new URL("./publicacion-instalados/src", import.meta.url)) } },
  };
});
