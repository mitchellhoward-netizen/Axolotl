import lottie from "./vendor/lottie_canvas.esm.js";

const STATIC_MASCOT = "/animation/benny-rest.svg?v=clay-rest-1";
const ANIMATION_DATA = "/animation/wake.json?v=clay-rest-1";

/** Mounts Benny's one-shot wake-up animation into a dedicated container. */
export async function mountWake(container) {
  if (!(container instanceof Element))
    throw new TypeError("mountWake requires a container Element");

  let animation = null;
  let disposed = false;
  const motionPreference = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  const showStatic = () => {
    animation?.destroy();
    animation = null;
    const image = new Image();
    image.src = STATIC_MASCOT;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    image.style.cssText =
      "display:block;width:100%;height:100%;object-fit:contain";
    container.replaceChildren(image);
    container.dataset.settled = "true";
  };

  const onPreferenceChange = (event) => {
    if (!disposed && event.matches) showStatic();
  };
  motionPreference.addEventListener("change", onPreferenceChange);

  const cleanup = () => {
    disposed = true;
    motionPreference.removeEventListener("change", onPreferenceChange);
    animation?.destroy();
  };

  if (motionPreference.matches) {
    showStatic();
    return cleanup;
  }

  try {
    const response = await fetch(ANIMATION_DATA, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok)
      throw new Error(`Wake animation failed to load (${response.status})`);
    const animationData = await response.json();
    if (motionPreference.matches) {
      showStatic();
      return cleanup;
    }

    animation = lottie.loadAnimation({
      container,
      renderer: "canvas",
      loop: false,
      autoplay: false,
      animationData,
      rendererSettings: { clearCanvas: true, progressiveLoad: false },
    });

    animation.addEventListener("DOMLoaded", () => {
      if (disposed || motionPreference.matches || !animation) return;
      const canvas = container.querySelector("canvas");
      canvas?.setAttribute("aria-hidden", "true");
      for (const child of [...container.children])
        if (child !== canvas) child.remove();
      animation.play();
    });
    animation.addEventListener("data_failed", showStatic);
    animation.addEventListener("complete", showStatic);
  } catch {
    showStatic();
  }

  return cleanup;
}
