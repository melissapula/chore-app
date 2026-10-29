// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',
    devtools: { enabled: true },

    // Dev server on 3001 so it doesn't collide with the NestJS API on 3000.
    devServer: { port: 3001 },

    modules: [
        '@nuxt/eslint',
        '@nuxtjs/supabase',
        '@vite-pwa/nuxt',
        '@nuxtjs/turnstile',
    ],

    // Design-system styling. ORDER MATTERS: base tokens first, then our
    // kid-friendly override so it wins the cascade.
    css: ['@mfp-design-system/tokens/css', '~/assets/css/theme-playful.css'],

    // <mfp-*> are Lit custom elements — tell Vue not to treat them as components.
    vue: {
        compilerOptions: {
            isCustomElement: (tag) => tag.startsWith('mfp-'),
        },
    },

    app: {
        head: {
            // Phone-first PWA: color the browser chrome to match the brand and
            // let iOS run it fullscreen when added to the home screen. (The
            // manifest carries theme_color too, but this <meta> also styles the
            // address bar before install.)
            meta: [
                { name: 'theme-color', content: '#6c4ce0' },
                { name: 'mobile-web-app-capable', content: 'yes' },
                { name: 'apple-mobile-web-app-capable', content: 'yes' },
                {
                    name: 'apple-mobile-web-app-status-bar-style',
                    content: 'default',
                },
                { name: 'apple-mobile-web-app-title', content: 'ChoreQuest' },
                // Stop iOS auto-linking numbers (XP totals, PINs) as phone links.
                { name: 'format-detection', content: 'telephone=no' },
            ],
            link: [
                // iOS ignores manifest icons and fills transparency with black,
                // so it gets its own opaque icon.
                {
                    rel: 'apple-touch-icon',
                    href: '/apple-touch-icon-180x180.png',
                    sizes: '180x180',
                },
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

    // Cloudflare Turnstile widget on /login. The real site key comes from
    // NUXT_PUBLIC_TURNSTILE_SITE_KEY at runtime; empty means no widget and no
    // token, which only works against an Auth with CAPTCHA off (the local
    // stack). Supabase Auth verifies the token, so no secretKey here.
    turnstile: {
        siteKey: '',
    },

    // Installable PWA (SPEC §1 — ship to family first, Capacitor later).
    pwa: {
        registerType: 'autoUpdate',
        manifest: {
            name: 'ChoreQuest',
            short_name: 'ChoreQuest',
            description:
                'Family chores as quests — earn XP, level up, and save toward rewards.',
            theme_color: '#6c4ce0',
            background_color: '#fffdfa',
            display: 'standalone',
            start_url: '/',
            // Android Chrome only offers "Install app" with 192 + 512 icons.
            // The maskable one sits inside the safe zone on a solid background,
            // so Android's circle/squircle crop doesn't cut off the artwork.
            icons: [
                { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
                { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                {
                    src: 'maskable-icon-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                },
            ],
        },
        workbox: {
            navigateFallback: '/',
            // Pull our push / notificationclick handlers into the generated SW.
            importScripts: ['/sw-push.js'],
        },
        devOptions: {
            enabled: true,
        },
    },
});
