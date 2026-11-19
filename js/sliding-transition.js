const activeSlides = new WeakMap();

export function slideIn(element, x = 0, y = 0) {
  activeSlides.get(element)?.cancel();
  if (!element.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const animation = element.animate([
    { transform: "translate(" + x + "px," + y + "px)", opacity: .75 },
    { transform: 'none', opacity: 1 },
  ], { duration: 180, easing: 'cubic-bezier(.23, 1, .32, 1)' });
  activeSlides.set(element, animation);
  const clear = () => { if (activeSlides.get(element) === animation) activeSlides.delete(element); };
  animation.onfinish = animation.oncancel = clear;
}
