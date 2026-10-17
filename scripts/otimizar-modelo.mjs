/**
 * Otimiza um modelo GLB para a web/Meta Quest:
 *   - remove dados duplicados e sem uso (sem fundir malhas: os nomes das peças são preservados,
 *     pois o app identifica os componentes por eles);
 *   - solda vértices e comprime a geometria com meshopt (EXT_meshopt_compression + quantização).
 * O decodificador (meshopt_decoder.js, MIT) é copiado para public/vendor/ e servido localmente.
 *
 *   - limita a resolução das texturas (--textura=1024 por padrão; imagens quase lisas ficam com 512 px),
 *     o que reduz a memória de GPU no Quest.
 *
 * Opcional: --simplificar=0.5 reduz a contagem de triângulos (meshopt simplifier) só enquanto o
 * desvio de forma ficar abaixo de --erro (padrão 0,0008 = 0,08% do tamanho da malha).
 * Opcional: --webp converte as texturas para WebP (EXT_texture_webp; Quest, Chrome, Edge e Safari 14+).
 *
 * Uso:
 *   npm run otimizar-modelo -- modelos-originais/toyota-bz4x.glb public/models/toyota-bz4x.glb --simplificar=0.5 --webp
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const [input, outputArg] = args.filter((a) => !a.startsWith("--"));
const ratio = flag("simplificar") ? Number(flag("simplificar")) : null;
const error = Number(flag("erro") ?? 0.0008);
const maxTexture = Number(flag("textura") ?? 1024);
const webp = args.includes("--webp");
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
const textureReport = await resizeTextures(doc, maxTexture, { webp });
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
for (const line of textureReport) console.log(`  textura ${line}`);
console.log("Decodificador copiado para public/vendor/meshopt_decoder.js");

/**
 * Limita a resolução das texturas. Uma imagem "quase lisa" (PNG minúsculo para a resolução, ex.:
 * 2048² em 9 KB — cor única com um selo) fica com 512 px: no Quest, cada 2048² ocupa ~21 MB de GPU.
 */
async function resizeTextures(document, max, { webp }) {
  const report = [];
  for (const texture of document.getRoot().listTextures()) {
    const [w, h] = texture.getSize() ?? [0, 0];
    const image = texture.getImage();
    if (!w || !image) continue;
    const flat = image.byteLength < (w * h) / 200;
    const scale = Math.min(1, (flat ? Math.min(512, max) : max) / Math.max(w, h));
    if (scale === 1 && !webp) continue;
    const [nw, nh] = [Math.round(w * scale), Math.round(h * scale)];
    let pipeline = sharp(image).resize(nw, nh, { kernel: "lanczos3" });
    if (webp) pipeline = pipeline.webp({ quality: 90, effort: 6 });
    else if (texture.getMimeType() === "image/jpeg") pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
    else pipeline = pipeline.png({ compressionLevel: 9 });
    const out = new Uint8Array(await pipeline.toBuffer());
    report.push(`${w}×${h} ${(image.byteLength / 1024).toFixed(0)} KB → ${nw}×${nh} ${(out.byteLength / 1024).toFixed(0)} KB${flat ? " (quase lisa)" : ""}`);
    texture.setImage(out);
    if (webp) texture.setMimeType("image/webp").setURI(texture.getURI().replace(/\.\w+$/, ".webp"));
  }
  if (webp && report.length) document.createExtension(EXTTextureWebP).setRequired(true);
  return report;
}
