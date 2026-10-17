/**
 * Otimiza um modelo GLB para a web/Meta Quest:
 *   - remove dados duplicados e sem uso (sem fundir malhas: os nomes das peças são preservados,
 *     pois o app identifica os componentes por eles);
 *   - solda vértices e comprime a geometria com meshopt (EXT_meshopt_compression + quantização).
 * O decodificador (meshopt_decoder.js, MIT) é copiado para public/vendor/ e servido localmente.
 *
 * Uso:
 *   npm run otimizar-modelo -- caminho/entrada.glb public/models/byd-song-pro.glb
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const [input, outputArg] = process.argv.slice(2);
if (!input) {
  console.error("Uso: npm run otimizar-modelo -- entrada.glb [saida.glb]");
  process.exit(1);
}
const output = outputArg ?? input.replace(/\.glb$/i, "") + ".otimizado.glb";

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const doc = await io.read(input);
await doc.transform(
  // Não deduplica malhas: nós repetidos virariam instâncias e perderiam material próprio.
  dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MATERIAL, PropertyType.TEXTURE] }),
  prune({ keepLeaves: true }),
  weld(),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(output, doc);

// O pacote não exporta o arquivo do decodificador; localiza-o pela pasta do ponto de entrada.
const meshoptDir = path.dirname(fileURLToPath(import.meta.resolve("meshoptimizer")));
const vendorDir = path.resolve("public/vendor");
fs.mkdirSync(vendorDir, { recursive: true });
fs.copyFileSync(path.join(meshoptDir, "meshopt_decoder.cjs"), path.join(vendorDir, "meshopt_decoder.js"));

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`${input}: ${kb(input)} KB  →  ${output}: ${kb(output)} KB`);
console.log("Decodificador copiado para public/vendor/meshopt_decoder.js");
