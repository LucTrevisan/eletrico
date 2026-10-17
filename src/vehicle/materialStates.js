import { Color3, Material } from "@babylonjs/core";

/**
 * Estados visuais por malha do veículo (raio X, destaque, seleção, hover).
 *
 * No GLB, vários conjuntos compartilham o mesmo material (ex.: o "Alumínio" é usado
 * pela bandeja da bateria, pelo motor e pelo inversor). Para que cada componente possa
 * ficar transparente ou brilhar sozinho, cada malha recebe um clone do seu material.
 * Os clones compartilham texturas e shaders — o custo extra é desprezível.
 *
 * Opacidade: fator 0–1 sobre a opacidade original.
 * Brilho: soma de "canais" de emissão (xray, select, hover) sobre a emissão original.
 */
export function createMaterialStates(meshes) {
  const states = new Map();
  const tmp = new Color3();

  for (const mesh of meshes) {
    const original = mesh.material;
    if (!original || !("alpha" in original) || !original.emissiveColor) continue;
    const mat = original.clone(`${original.name}#${mesh.uniqueId}`);
    mesh.material = mat;
    states.set(mesh, {
      mat,
      base: {
        alpha: mat.alpha,
        emissive: mat.emissiveColor.clone(),
        transparencyMode: mat.transparencyMode,
        needDepthPrePass: mat.needDepthPrePass,
        useRadianceOverAlpha: mat.useRadianceOverAlpha,
        useSpecularOverAlpha: mat.useSpecularOverAlpha,
      },
      fade: 1,
      blended: false,
      tints: {},
    });
  }

  function applyEmissive(s) {
    tmp.copyFrom(s.base.emissive);
    for (const t of Object.values(s.tints)) {
      if (t.k > 0) {
        tmp.r += t.color.r * t.k;
        tmp.g += t.color.g * t.k;
        tmp.b += t.color.b * t.k;
      }
    }
    s.mat.emissiveColor.copyFrom(tmp);
  }

  return {
    has: (mesh) => states.has(mesh),

    /** Opacidade relativa (1 = original). Liga a mistura por transparência só quando necessário. */
    setFade(mesh, fade) {
      const s = states.get(mesh);
      if (!s) return;
      s.fade = fade;
      const { mat, base } = s;
      const needsBlend = fade < 0.999;
      if (needsBlend && !s.blended) {
        mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
        // Pré-passe de profundidade: só a camada mais próxima da carroceria aparece (sem "fantasmas" internos).
        mat.needDepthPrePass = true;
        // Sem isso, os reflexos continuariam opacos e a peça pareceria um espelho.
        if ("useRadianceOverAlpha" in mat) mat.useRadianceOverAlpha = false;
        if ("useSpecularOverAlpha" in mat) mat.useSpecularOverAlpha = false;
        s.blended = true;
      } else if (!needsBlend && s.blended) {
        mat.transparencyMode = base.transparencyMode;
        mat.needDepthPrePass = base.needDepthPrePass;
        if ("useRadianceOverAlpha" in mat) mat.useRadianceOverAlpha = base.useRadianceOverAlpha;
        if ("useSpecularOverAlpha" in mat) mat.useSpecularOverAlpha = base.useSpecularOverAlpha;
        s.blended = false;
      }
      mat.alpha = base.alpha * fade;
    },

    getFade(mesh) {
      return states.get(mesh)?.fade ?? 1;
    },

    /** Canal de brilho: `color` em espaço linear, `k` de 0 a 1+. */
    setTint(mesh, channel, color, k) {
      const s = states.get(mesh);
      if (!s) return;
      const t = s.tints[channel] ?? (s.tints[channel] = { color: new Color3(), k: 0 });
      t.color.copyFrom(color);
      t.k = k;
      applyEmissive(s);
    },
  };
}
