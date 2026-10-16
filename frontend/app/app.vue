<template>
    <div>
        <!-- Adds <link rel="manifest">; without it the PWA isn't installable. -->
        <NuxtPwaManifest />
        <NuxtRouteAnnouncer />
        <NuxtPage />
    </div>
</template>
