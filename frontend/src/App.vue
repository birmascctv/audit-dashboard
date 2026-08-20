<template>
  <div class="container">
    <header>
      <h1>Audit Dashboard — Categories</h1>
      <div class="controls">
        <select v-model="selectedCategory" @change="onCategoryChange">
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>

        <label>
          <input type="checkbox" v-model="useNormalized" @change="onCategoryChange" />
          Use Normalized
        </label>

        <div class="stores">
          <label v-for="s in stores" :key="s.store_id">
            <input type="checkbox" v-model="selectedStores" :value="s.store_id" @change="onCategoryChange" />
            {{ s.name }}
          </label>
        </div>
      </div>
    </header>

    <main>
      <CategoryCard
        v-if="selectedCategory"
        :category="selectedCategory"
        :stores-map="storesMap"
        :selected-stores="selectedStores"
        :use-normalized="useNormalized"
      />
    </main>
  </div>
</template>

<script>
import axios from 'axios'
import CategoryCard from './components/CategoryCard.vue'

export default {
  components: { CategoryCard },
  data() {
    return {
      categories: [],
      stores: [],
      storesMap: {},
      selectedCategory: null,
      selectedStores: [],
      useNormalized: false
    }
  },
  async created() {
    const [catsRes, storesRes] = await Promise.all([
      axios.get('/api/categories'),
      axios.get('/api/stores')
    ])
    this.categories = catsRes.data
    this.stores = storesRes.data
    this.storesMap = this.stores.reduce((m, s) => { m[s.store_id] = s.name; return m }, {})
    if (this.categories.length) this.selectedCategory = this.categories[0]
    this.selectedStores = this.stores.map(s => s.store_id)
  },
  methods: {
    onCategoryChange() {
      // CategoryCard watches props and will refresh
    }
  }
}
</script>

<style>
.container { padding: 20px; font-family: Arial, sans-serif; }
.controls { display:flex; gap:20px; align-items:center; margin-bottom:16px; }
.stores { display:flex; gap:8px; flex-wrap:wrap; max-width:60%; }
</style>
