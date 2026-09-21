/**
 * The hero mascot.
 *
 * This used to mount a Lottie "wake up" animation of the previous mascot and fall back to
 * that mascot's SVG. The mascot is now a real illustration, so the animation is a plain CSS
 * float. The look and the motion deliberately live in the page's own <style> block rather
 * than here: if this module never loads, the mascot still blends into the page and still
 * moves, and no stale artwork can be substituted for it.
 *
 * site.js owns the pause button and toggles `data-paused` on the container; the CSS honours
 * that. All this module does is make sure the right image is in place, and hide the button
 * when the reader has asked for reduced motion, so we never show a control that does nothing.
 */
const MASCOT_SRC = "/animation/axolotl-mascot.png?v=mascot-1";
const MASCOT_CLASS = "axolotl-figure";

/** Mounts the mascot into its container. Returns a cleanup function. */
export async function mountWake(container) {
  if (!(container instanceof Element))
    throw new TypeError("mountWake requires a container Element");

  // Only replace what is there if the right image is not already present, so we never
  // clobber the static markup with a different asset.
  if (!container.querySelector(`img.${MASCOT_CLASS}`)) {
    const image = new Image();
    image.src = MASCOT_SRC;
    image.alt = "";
    image.className = MASCOT_CLASS;
    image.setAttribute("aria-hidden", "true");
    container.replaceChildren(image);
  }

  const motionToggle = document.getElementById("benny-motion");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const syncToggle = () => {
    if (motionToggle) motionToggle.hidden = motionPreference.matches;
  };
  syncToggle();
  motionPreference.addEventListener("change", syncToggle);

  container.dataset.settled = "true";

  return () => motionPreference.removeEventListener("change", syncToggle);
}
