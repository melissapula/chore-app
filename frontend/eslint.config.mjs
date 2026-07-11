// Nuxt's ESLint flat config. `@nuxt/eslint` generates the base config into
// .nuxt/eslint.config.mjs during `nuxi prepare` (runs on postinstall); this
// wraps it so we can append project rules if needed.
import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt(
  // Custom elements from the design system aren't Vue components.
  {
    rules: {
      'vue/no-undef-components': 'off',
    },
  },
);
