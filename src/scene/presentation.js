/**
 * Animações de apresentação: utilitário de tween e a sequência de abertura
 * (luzes acendendo, anel de varredura holográfica e voo de câmera até a vista inicial).
 */

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Tween simples sincronizado com o render loop do Babylon.
 * Se a aba ficar oculta, o tempo continua correndo e a animação termina no estado final.
 */
export function tween(scene, { duration, delay = 0, ease = easeInOutCubic, onUpdate, onComplete }) {
  const start = performance.now() + delay;
  let done = false;
  const observer = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    if (now < start) return;
    const t = clamp01((now - start) / duration);
    onUpdate(ease(t));
    if (t >= 1) finish();
  });
  function stop() {
    done = true;
    scene.onBeforeRenderObservable.remove(observer);
  }
  function finish() {
    if (done) return;
    stop();
    onComplete?.();
  }
  return {
    cancel() {
      if (!done) stop();
    },
    /** Pula para o estado final. */
    complete() {
      if (done) return;
      onUpdate(1);
      finish();
    },
  };
}

/**
 * Sequência de abertura. Qualquer clique/toque pula para o estado final.
 * Respeita `prefers-reduced-motion` (sem voo de câmera).
 */
export function playIntro(scene, { camera, views, lighting, showroom, skip = false }) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const hero = views.views.hero;
  const heroRadius = views.fitRadius("hero");

  if (skip) {
    lighting.setLevel(1);
    showroom.setEmissiveLevel("all", 1);
    views.jumpTo("hero");
    return Promise.resolve();
  }

  const tweens = [];
  lighting.setLevel(0);
  showroom.setEmissiveLevel("all", 0);

  tweens.push(tween(scene, { duration: 2200, ease: easeOutCubic, onUpdate: (t) => lighting.setLevel(t) }));
  tweens.push(tween(scene, { duration: 900, onUpdate: (t) => showroom.setEmissiveLevel("floor", t) }));
  tweens.push(tween(scene, { duration: 900, delay: 250, onUpdate: (t) => showroom.setEmissiveLevel("platform", t) }));
  tweens.push(tween(scene, { duration: 1400, delay: 700, onUpdate: (t) => showroom.setEmissiveLevel("pillars", t) }));
  tweens.push(tween(scene, { duration: 1200, delay: 1300, onUpdate: (t) => showroom.setEmissiveLevel("halo", t) }));
  tweens.push(tween(scene, { duration: 1200, delay: 1700, onUpdate: (t) => showroom.setEmissiveLevel("title", t) }));
  tweens.push(showroom.playScan({ delay: 900 }));

  if (reduced) {
    views.jumpTo("hero");
  } else {
    const from = { alpha: hero.alpha - 1.25, beta: 1.42, radius: heroRadius * 1.85 };
    views.cancel();
    camera.alpha = from.alpha;
    camera.beta = from.beta;
    camera.radius = from.radius;
    camera.setTarget(views.target.clone());
    tweens.push(
      tween(scene, {
        duration: 4200,
        ease: easeInOutCubic,
        onUpdate: (t) => {
          camera.alpha = from.alpha + (hero.alpha - from.alpha) * t;
          camera.beta = from.beta + (hero.beta - from.beta) * t;
          camera.radius = from.radius + (heroRadius - from.radius) * t;
        },
      }),
    );
  }

  return new Promise((resolve) => {
    const canvas = scene.getEngine().getRenderingCanvas();
    const finishAll = () => {
      canvas.removeEventListener("pointerdown", finishAll);
      canvas.removeEventListener("wheel", finishAll);
      for (const t of tweens) t.complete();
      resolve();
    };
    canvas.addEventListener("pointerdown", finishAll, { passive: true });
    canvas.addEventListener("wheel", finishAll, { passive: true });
    setTimeout(finishAll, reduced ? 2400 : 4400);
  });
}
