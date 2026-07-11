<script setup lang="ts">
// Placeholder auth entry point. Wired to Supabase magic-link sign-in.
// The <mfp-*> inputs are form-associated, so native FormData reads their values.
const supabase = useSupabaseClient()
const sent = ref(false)
const error = ref<string | null>(null)

async function onSubmit(e: Event) {
  error.value = null
  const form = e.target as HTMLFormElement
  const email = String(new FormData(form).get('email') || '')
  const { error: err } = await supabase.auth.signInWithOtp({ email })
  if (err) error.value = err.message
  else sent.value = true
}
</script>

<template>
  <main class="wrap">
    <h1>Log in</h1>
    <form v-if="!sent" @submit.prevent="onSubmit">
      <mfp-input
        name="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        required
      />
      <mfp-button type="submit" variant="primary">Send magic link</mfp-button>
      <mfp-alert v-if="error" variant="error">{{ error }}</mfp-alert>
    </form>
    <mfp-alert v-else variant="success">
      Check your email for a login link.
    </mfp-alert>
    <p class="back"><NuxtLink to="/">← Back</NuxtLink></p>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 22rem;
  margin: 4rem auto;
  padding: 0 1rem;
  font-family: var(--font-family-sans);
  color: var(--color-text-default);
}
h1 {
  font-family: 'Baloo 2', var(--font-family-sans);
  color: var(--color-brand-primary);
}
form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.back {
  margin-top: 1.5rem;
}
</style>
