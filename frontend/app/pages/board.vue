<script setup lang="ts">
// The kid's quest board now lives on the tabbed /dashboard (KidDashboard.vue).
// Keep this route as a redirect so old links / bookmarks still work.
navigateTo('/dashboard', { replace: true });
</script>

<template>
    <p class="muted">Taking you to your dashboard…</p>
</template>

<style scoped>
.muted {
    max-width: 32rem;
    margin: 4rem auto;
    padding: 0 1rem;
    color: var(--color-text-muted);
    font-family: var(--font-family-sans);
}
</style>
