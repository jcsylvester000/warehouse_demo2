// Global image lightbox — click any item/group picture to view it large.
import { reactive } from 'vue';
const state = reactive({ src: '', alt: '', open: false });
export function useLightbox() {
  return {
    state,
    open(src, alt = '') { if (!src) return; state.src = src; state.alt = alt || ''; state.open = true; },
    close() { state.open = false; state.src = ''; state.alt = ''; },
  };
}
