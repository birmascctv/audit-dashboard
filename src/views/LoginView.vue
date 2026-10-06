<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth, DEFAULT_ACCOUNTS } from '../composables/useAuth.js';
import {
  ClipboardCheck,
  Lock,
  User as UserIcon,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  KeyRound
} from 'lucide-vue-next';

const router = useRouter();
const { loginWithBackend } = useAuth();

const username = ref('');
const password = ref('');
const isLoading = ref(false);
const errorMessage = ref(null);

function selectPreset(acc) {
  username.value = acc.username;
  if (acc.username === 'superadmin') password.value = 'superadmin666';
  else if (acc.username === 'admin') password.value = 'admin666';
  else if (acc.username === 'chrisna' || acc.username === 'auditor') password.value = 'auditor666';
  handleLogin();
}

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
          <span class="text-[11px] text-slate-400">Role-Based Access</span>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <!-- Username / Email -->
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1.5">
              Username or Email
            </label>
            <div class="relative">
              <UserIcon class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                v-model="username"
                type="text"
                required
                autocomplete="username"
                placeholder="superadmin, admin, or chrisna..."
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
                placeholder="Enter password..."
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

        <!-- Quick 1-Click Role Switcher Profiles -->
        <div class="mt-6 pt-5 border-t border-slate-100">
          <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2.5">
            Quick Sign In by Role:
          </span>
          <div class="space-y-2">
            <!-- Superadmin -->
            <button
              @click="selectPreset(DEFAULT_ACCOUNTS[0])"
              type="button"
              class="w-full p-2.5 rounded-xl border border-purple-200 bg-purple-50/60 hover:bg-purple-100 text-left transition-colors flex items-center justify-between cursor-pointer group"
            >
              <div>
                <span class="text-xs font-bold text-purple-900 block">Super Admin (superadmin)</span>
                <span class="text-[10px] text-purple-700">Access: Both Stock Audit & Sales Report</span>
              </div>
              <ArrowRight class="w-3.5 h-3.5 text-purple-600 group-hover:translate-x-1 transition-transform" />
            </button>

            <!-- Admin -->
            <button
              @click="selectPreset(DEFAULT_ACCOUNTS[1])"
              type="button"
              class="w-full p-2.5 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100 text-left transition-colors flex items-center justify-between cursor-pointer group"
            >
              <div>
                <span class="text-xs font-bold text-blue-900 block">Admin (admin)</span>
                <span class="text-[10px] text-blue-700">Access: Sales Report Only</span>
              </div>
              <ArrowRight class="w-3.5 h-3.5 text-blue-600 group-hover:translate-x-1 transition-transform" />
            </button>

            <!-- Auditor -->
            <button
              @click="selectPreset(DEFAULT_ACCOUNTS[2])"
              type="button"
              class="w-full p-2.5 rounded-xl border border-teal-200 bg-teal-50/60 hover:bg-teal-100 text-left transition-colors flex items-center justify-between cursor-pointer group"
            >
              <div>
                <span class="text-xs font-bold text-teal-900 block">Auditor (chrisna)</span>
                <span class="text-[10px] text-teal-700">Access: Stock Physical Audit Only</span>
              </div>
              <ArrowRight class="w-3.5 h-3.5 text-teal-600 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
