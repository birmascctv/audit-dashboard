<template>
  <header class="card flex items-center justify-between mb-4">
    <div>
      <h1 class="brand text-xl font-bold text-white">Birmas</h1>
      <div class="muted text-sm">Audit Dashboard — 2026</div>
    </div>
    <div class="flex gap-2">
      <!-- optional buttons -->
      <button class="btn btn-ghost">Settings</button>
      <button class="btn btn-primary">Logout</button>
    </div>
  </header>
</template>

<style scoped>
.card {
  padding: 1rem;
  border-radius: 0.75rem;
  background: #1e293b; /* same dark slate as charts */
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  border: 1px solid #334155;
  color: #f1f5f9;
}
.brand {
  color: #ef4444; /* red accent consistent with charts */
}
.muted {
  color: #9ca3af;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
  border: 0;
}
.btn-primary {
  background: #ef4444;
  color: #fff;
}
.btn-ghost {
  background: transparent;
  color: #9ca3af;
  border: 1px solid rgba(255,255,255,0.1);
}
</style>
