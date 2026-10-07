<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import {
  ClipboardCheck,
  Lock,
  User as UserIcon,
  ArrowRight,
  AlertCircle
} from 'lucide-vue-next';

const router = useRouter();
const { loginWithBackend } = useAuth();

const username = ref('');
const password = ref('');
const isLoading = ref(false);
const errorMessage = ref(null);

async function handleLogin() {
  errorMessage.value = null;
  if (!username.value.trim() || !password.value.trim()) {
    errorMessage.value = 'Please enter both username and password';
    return;
  }

  isLoading.value = true;
  try {
    const result = await loginWithBackend(username.value, password.value);
    if (result.success) {
      if (result.user?.role === 'admin') {
        router.push('/sales');
      } else {
        router.push('/dashboard');
      }
    } else {
      errorMessage.value = result.message || 'Invalid username or password';
    }
  } catch (err) {
    errorMessage.value = err.message || 'Login failed. Please check backend connection.';
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans">
    <!-- Subtle tosca ambient glow -->
    <div class="absolute -top-32 -left-32 w-96 h-96 bg-teal-200/40 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-cyan-200/40 rounded-full blur-3xl pointer-events-none"></div>

    <div class="w-full max-w-md relative z-10 space-y-4">
      <!-- Brand Logo / Header -->
      <div class="text-center mb-6">
        <div class="inline-flex w-16 h-16 rounded-2xl bg-white border border-slate-200 overflow-hidden items-center justify-center shadow-xl shadow-slate-300/40 mb-3 p-1">
          <img
            src="/birmas_logo.png"
            alt="Birmas Logo"
            class="w-full h-full object-contain"
            onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"
          />
          <div class="w-full h-full rounded-xl bg-gradient-to-tr from-teal-600 to-cyan-600 hidden items-center justify-center text-white">
            <ClipboardCheck class="w-8 h-8 text-white" />
          </div>
        </div>
        <h1 class="text-2xl font-black text-slate-900 tracking-tight">
          Birmas Audit Dashboard
        </h1>
        <p class="text-xs text-slate-500 mt-1">Stock Physical Audit & Sales Recapitulation</p>
      </div>

      <!-- Main Login Card (Clean Minimal Theme) -->
      <div class="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60">
        <div class="mb-5 border-b border-slate-100 pb-3 flex items-center justify-between">
          <h2 class="text-base font-bold text-slate-900">Sign In</h2>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <!-- Username -->
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1.5">
              Username
            </label>
            <div class="relative">
              <UserIcon class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                v-model="username"
                type="text"
                required
                autocomplete="username"
                placeholder="Enter username"
                class="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-medium placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-100 transition-all"
              />
            </div>
          </div>

          <!-- Password -->
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1.5">
              Password
            </label>
            <div class="relative">
              <Lock class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                v-model="password"
                type="password"
                required
                autocomplete="current-password"
                placeholder="Enter password"
                class="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-medium placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-100 transition-all"
              />
            </div>
          </div>

          <!-- Error Alert -->
          <div
            v-if="errorMessage"
            class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2"
          >
            <AlertCircle class="w-4 h-4 text-rose-600 shrink-0" />
            <span>{{ errorMessage }}</span>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="isLoading"
            class="w-full py-3 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-600/25 transition-all disabled:opacity-50 mt-2 cursor-pointer"
          >
            <span>{{ isLoading ? 'Signing In...' : 'Sign In' }}</span>
            <ArrowRight class="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
