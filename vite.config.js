import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// `base: "./"` gera caminhos relativos no build — obrigatório para GitHub Pages
// (o site fica em usuario.github.io/repositorio/, não na raiz do domínio).
// `--mode https` liga um certificado autoassinado para testar WebXR no Meta Quest pela rede local.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "https" ? [basicSsl()] : [],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    outDir: "dist",
    target: "es2022",
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        // Babylon em um chunk separado: o navegador mantém em cache entre atualizações do app.
        manualChunks: (id) => (id.includes("node_modules/@babylonjs") ? "babylon" : undefined),
      },
    },
  },
}));
