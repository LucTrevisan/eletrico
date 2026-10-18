/**
 * Verifica se há suporte a VR imersivo. O botão "Entrar em VR" só aparece se `supported`.
 * Nunca lança exceção: devolve um motivo legível para exibir na interface.
 */
export async function checkVRSupport() {
  if (!window.isSecureContext) {
    return { supported: false, reason: "WebXR exige HTTPS (ou localhost)." };
  }
  if (!("xr" in navigator)) {
    return { supported: false, reason: "Este navegador não oferece WebXR." };
  }
  try {
    const ok = await navigator.xr.isSessionSupported("immersive-vr");
    return ok ? { supported: true } : { supported: false, reason: "Nenhum headset de VR disponível neste dispositivo." };
  } catch (err) {
    return { supported: false, reason: `WebXR indisponível: ${err?.message || err}` };
  }
}

/** Realidade aumentada (Quest com passthrough, Chrome no Android com ARCore). Nunca lança exceção. */
export async function checkARSupport() {
  if (!window.isSecureContext || !("xr" in navigator)) return { supported: false };
  try {
    return { supported: await navigator.xr.isSessionSupported("immersive-ar") };
  } catch {
    return { supported: false };
  }
}
