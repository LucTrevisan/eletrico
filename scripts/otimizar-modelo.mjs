/**
 * Otimiza um modelo GLB para a web/Meta Quest:
 *   - remove dados duplicados e sem uso (sem fundir malhas: os nomes das peças são preservados,
 *     pois o app identifica os componentes por eles);
 *   - solda vértices e comprime a geometria com meshopt (EXT_meshopt_compression + quantização).
 * O decodificador (meshopt_decoder.js, MIT) é copiado para public/vendor/ e servido localmente.
 *
 * Opcional: --simplificar=0.5 reduz a contagem de triângulos (meshopt simplifier) só enquanto o
 * desvio de forma ficar abaixo de --erro (padrão 0,0008 = 0,08% do tamanho da malha).
 *
 * Uso:
 *   npm run otimizar-modelo -- caminho/entrada.glb public/models/toyota-bz4x.glb --simplificar=0.5
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const [input, outputArg] = args.filter((a) => !a.startsWith("--"));
const ratio = flag("simplificar") ? Number(flag("simplificar")) : null;
const error = Number(flag("erro") ?? 0.0008);
if (!input) {
  console.error("Uso: npm run otimizar-modelo -- entrada.glb [saida.glb]");
  process.exit(1);
}
const output = outputArg ?? input.replace(/\.glb$/i, "") + ".otimizado.glb";

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const doc = await io.read(input);
await doc.transform(
  // Não deduplica malhas: nós repetidos virariam instâncias e perderiam material próprio.
  dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MATERIAL, PropertyType.TEXTURE] }),
  prune({ keepLeaves: true }),
  weld(),
  ...(ratio ? [simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: true })] : []),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
const triangles = doc
  .getRoot()
  .listMeshes()
  .flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
await io.write(output, doc);

// O pacote não exporta o arquivo do decodificador; localiza-o pela pasta do ponto de entrada.
const meshoptDir = path.dirname(fileURLToPath(import.meta.resolve("meshoptimizer")));
const vendorDir = path.resolve("public/vendor");
fs.mkdirSync(vendorDir, { recursive: true });
fs.copyFileSync(path.join(meshoptDir, "meshopt_decoder.cjs"), path.join(vendorDir, "meshopt_decoder.js"));

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`${input}: ${kb(input)} KB  →  ${output}: ${kb(output)} KB · ${Math.round(triangles).toLocaleString("pt-BR")} triângulos`);
console.log("Decodificador copiado para public/vendor/meshopt_decoder.js");
