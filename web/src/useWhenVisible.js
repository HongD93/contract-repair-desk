import { nextTick, onBeforeUnmount, onMounted } from 'vue';

// Keep anchored sections in the DOM; load their evidence once on first approach.
export function useWhenVisible(element, load, anchors = []) {
  let observer;
  let started = false;
  let disposed = false;
  let requestedAnchor;
  async function start() {
    if (started) return;
    started = true;
    observer?.disconnect();
    await load();
    await nextTick();
    if (!disposed && requestedAnchor && location.hash === requestedAnchor) {
      document.getElementById(requestedAnchor.slice(1))?.scrollIntoView();
    }
  }
  function navigate() {
    if (!anchors.includes(location.hash)) return;
    requestedAnchor = location.hash;
    start();
  }
  onMounted(() => {
    window.addEventListener('hashchange', navigate);
    navigate();
    if (started) return;
    if (!element.value || typeof IntersectionObserver === 'undefined') { start(); return; }
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) start();
    }, { rootMargin: '150px' });
    observer.observe(element.value);
  });
  onBeforeUnmount(() => { disposed = true; started = true; observer?.disconnect(); window.removeEventListener('hashchange', navigate); });
}
