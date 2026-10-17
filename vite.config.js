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
    // O Babylon é importado por caminhos específicos (src/babylon.js) e os módulos de VR,
    // o leitor glTF e suas extensões são carregados sob demanda — sem chunk manual aqui,
    // senão o código sob demanda voltaria para o pacote inicial.
    chunkSizeWarningLimit: 2500,
  },
}));
