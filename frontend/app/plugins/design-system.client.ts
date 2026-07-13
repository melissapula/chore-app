// Registers every <mfp-*> custom element. Client-only: the components are Lit
// (they touch browser globals), so they must not run during SSR. The tag markup
// still renders on the server; the elements upgrade on hydration.
import '@mfp-design-system/all';

export default defineNuxtPlugin(() => {});
