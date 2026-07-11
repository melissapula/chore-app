<script setup lang="ts">
// Public landing (excluded from the auth redirect in nuxt.config).
const user = useSupabaseUser()
</script>

<template>
  <main class="wrap">
    <h1>🧹 Chore App</h1>
    <p>Family chores, virtual balances, and savings goals.</p>
    <div class="actions">
      <NuxtLink v-if="!user" to="/login">
        <mfp-button variant="primary">Log in</mfp-button>
      </NuxtLink>
      <NuxtLink v-else to="/dashboard">
        <mfp-button variant="primary">Open dashboard</mfp-button>
      </NuxtLink>
    </div>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 32rem;
  margin: 4rem auto;
  padding: 0 1rem;
  font-family: var(--font-family-sans);
  color: var(--color-text-default);
  text-align: center;
}
h1 {
  font-family: 'Baloo 2', var(--font-family-sans);
  color: var(--color-brand-primary);
}
p {
  color: var(--color-text-muted);
}
.actions {
  margin-top: 1.5rem;
}
</style>
