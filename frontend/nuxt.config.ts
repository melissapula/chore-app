// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Dev server on 3001 so it doesn't collide with the NestJS API on 3000.
  devServer: { port: 3001 },

  modules: [
    '@nuxtjs/supabase',
    '@vite-pwa/nuxt',
  ],

  // Design-system styling. ORDER MATTERS: base tokens first, then our
  // kid-friendly override so it wins the cascade.
  css: [
    '@mfp-design-system/tokens/css',
    '~/assets/css/theme-playful.css',
  ],

  // <mfp-*> are Lit custom elements — tell Vue not to treat them as components.
  vue: {
    compilerOptions: {
      isCustomElement: (tag) => tag.startsWith('mfp-'),
    },
  },

  app: {
    head: {
      link: [
        // Rounded, kid-legible font used by the playful theme.
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700&family=Nunito:wght@400;600;700;800&display=swap',
        },
      ],
    },
  },

  runtimeConfig: {
    public: {
      // Base URL of the NestJS API.
      apiBase: process.env.API_BASE || 'http://localhost:3000',
    },
  },

  // @nuxtjs/supabase reads SUPABASE_URL + SUPABASE_KEY from env.
  // Points at the shared Frula project; app data lives in the `chore` schema, so
  // default all PostgREST calls there (auth is unaffected — it uses auth.*).
  supabase: {
    clientOptions: {
      db: { schema: 'chore' },
    },
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/'],
    },
  },

  // Installable PWA (SPEC §1 — ship to family first, Capacitor later).
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Chore App',
      short_name: 'Chores',
      description: 'Family chores, virtual balances, and savings goals.',
      theme_color: '#6c4ce0',
      background_color: '#fffdfa',
      display: 'standalone',
      start_url: '/',
    },
    workbox: {
      navigateFallback: '/',
    },
    devOptions: {
      enabled: true,
    },
  },
})
