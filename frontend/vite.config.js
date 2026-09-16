// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'audit_birmas', 'audit_birmas.db')

const STORE_COLORS = {
  1: '#FF00FF',
  2: '#00FFFF',
  3: '#FFFF00',
  4: '#00FF00',
  5: '#FF8800',
  6: '#FF0000'
}

const CATEGORY_COLORS = {
  'Aplikasi': '#06B6D4',
  'Bar': '#3B82F6',
  'Chiller': '#6366F1',
  'Customer Service': '#EC4899',
  'Dapur': '#8B5CF6',
  'Higiene Staf': '#10B981',
  'Inventaris': '#F59E0B',
  'Kasir': '#EF4444',
  'Kebersihan Outlet': '#14B8A6',
  'Service': '#EC4899',
  'Showcase': '#F97316',
  'Stock Opname': '#84CC16',
  'Toilet': '#64748B'
}

function median(values) {
  if (!values || !values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function localAuditApiPlugin() {
  let db = null
  try {
    db = new DatabaseSync(dbPath)
  } catch (err) {
    console.warn('Could not open audit_birmas.db for local dev API:', err.message)
  }

  return {
    name: 'local-audit-api',
    configureServer(server) {
      if (!db) return

      server.middlewares.use((req, res, next) => {
        const parsedUrl = new URL(req.url, 'http://localhost')
        const pathname = parsedUrl.pathname
        const query = parsedUrl.searchParams

        // 1. Criteria endpoint
        if (pathname === '/api/criteria') {
          try {
            const yearParam = query.get('year')
            const excludeYearParam = query.get('exclude_year')
            const year = yearParam ? parseInt(yearParam, 10) : null
            const excludeYear = excludeYearParam ? parseInt(excludeYearParam, 10) : null

            let table = 'criteria'
            let where = ''
            const params = []

            if (year === 2025) {
              table = 'criteria2025'
            } else if (year) {
              where = 'WHERE year = ?'
              params.push(year)
            } else if (excludeYear === 2025) {
              table = 'criteria'
              where = 'WHERE year != 2025'
            } else if (excludeYear) {
              where = 'WHERE year != ?'
              params.push(excludeYear)
            }

            const sql = `SELECT criteria_id as id, name as label, category, passing_grade, metrics FROM ${table} ${where} ORDER BY category, name`
            const stmt = db.prepare(sql)
            const rows = params.length ? stmt.all(...params) : stmt.all()

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(rows))
            return
          } catch (err) {
            console.error('Error handling /api/criteria:', err)
            next()
            return
          }
        }

        // 2. Categories endpoint
        if (pathname === '/api/categories') {
          try {
            const sql = `SELECT DISTINCT category FROM (SELECT category FROM criteria UNION SELECT category FROM criteria2025) ORDER BY category`
            const rows = db.prepare(sql).all()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(rows.map(r => r.category)))
            return
          } catch (err) {
            console.error('Error handling /api/categories:', err)
            next()
            return
          }
        }

        // 3. Stores endpoint
        if (pathname === '/api/stores') {
          try {
            const rows = db.prepare('SELECT store_id, name FROM stores ORDER BY store_id').all()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(rows))
            return
          } catch (err) {
            console.error('Error handling /api/stores:', err)
            next()
            return
          }
        }

        // 4. Line Chart: /api/category/:cat/criterion/:crit/monthly
        const lineChartMatch = pathname.match(/^\/api\/category\/([^/]+)\/criterion\/([^/]+)\/monthly$/)
        if (lineChartMatch) {
          try {
            const cat = decodeURIComponent(lineChartMatch[1])
            const critRaw = decodeURIComponent(lineChartMatch[2])
            const yearParam = query.get('year')
            const excludeYearParam = query.get('exclude_year')
            const storesParam = query.get('stores')
            const year = yearParam ? parseInt(yearParam, 10) : null
            const excludeYear = excludeYearParam ? parseInt(excludeYearParam, 10) : null
            const storeIds = storesParam ? storesParam.split(',').map(Number).filter(n => !isNaN(n)) : []

            let critId = parseInt(critRaw, 10)
            if (isNaN(critId)) {
              const table = year === 2025 ? 'criteria2025' : 'all_criteria'
              const findStmt = db.prepare(`SELECT criteria_id FROM ${table} WHERE name = ? AND category = ? LIMIT 1`)
              const found = findStmt.get(critRaw, cat)
              if (found) critId = found.criteria_id
            }

            if (!critId) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ labels: [], datasets: [], average: [], average_count: [] }))
              return
            }

            let whereStore = ''
            const params = [critId]
            if (storeIds.length > 0) {
              whereStore = `AND a.store_id IN (${storeIds.map(() => '?').join(',')})`
              params.push(...storeIds)
            }
            let whereYear = ''
            if (year) {
              whereYear = 'AND a.year = ?'
              params.push(year)
            } else if (excludeYear) {
              whereYear = 'AND a.year != ?'
              params.push(excludeYear)
            }

            const sql = `
              SELECT a.store_id AS a_store_id, s.name AS store_name, a.year, a.month, sc.score AS score
              FROM scores sc
              JOIN audits a ON sc.audit_id = a.audit_id
              JOIN stores s ON a.store_id = s.store_id
              WHERE sc.criteria_id = ?
              ${whereStore}
              ${whereYear}
              ORDER BY a.year, a.month, a.store_id
            `
            const stmt = db.prepare(sql)
            const rows = stmt.all(...params)

            const groups = {}
            const storeNames = {}
            const rawByLabel = {}

            for (const r of rows) {
              const sid = r.a_store_id
              storeNames[sid] = r.store_name
              const lbl = `${r.year}-${String(r.month).padStart(2, '0')}`
              const key = `${sid}_${lbl}`
              if (!groups[key]) groups[key] = []
              if (!rawByLabel[lbl]) rawByLabel[lbl] = []
              if (r.score !== null && r.score !== undefined) {
                groups[key].push(Number(r.score))
                rawByLabel[lbl].push(Number(r.score))
              }
            }

            const labels = Object.keys(rawByLabel).sort()
            const datasets = []
            for (const [sidStr, name] of Object.entries(storeNames)) {
              const sid = Number(sidStr)
              const data = labels.map(lbl => {
                const vals = groups[`${sid}_${lbl}`]
                return vals && vals.length ? median(vals) : null
              })
              datasets.push({
                label: name,
                data,
                borderColor: STORE_COLORS[sid] || `hsl(${(sid * 60) % 360}, 70%, 50%)`,
                fill: false
              })
            }

            const average = labels.map(lbl => {
              const vals = rawByLabel[lbl] || []
              return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3)) : null
            })
            const averageCount = labels.map(lbl => (rawByLabel[lbl] || []).length)

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ labels, datasets, average, average_count: averageCount }))
            return
          } catch (err) {
            console.error('Error handling line chart:', err)
            next()
            return
          }
        }

        // 5. Category Passrate: /api/category/:cat/passrate
        const catPassrateMatch = pathname.match(/^\/api\/category\/([^/]+)\/passrate$/)
        if (catPassrateMatch) {
          try {
            const cat = decodeURIComponent(catPassrateMatch[1])
            const yearParam = query.get('year')
            const storesParam = query.get('stores')
            const year = yearParam ? parseInt(yearParam, 10) : null
            const storeIds = storesParam ? storesParam.split(',').map(Number).filter(n => !isNaN(n)) : []

            let whereStore = ''
            const params = [cat]
            if (storeIds.length > 0) {
              whereStore = `AND m.store_id IN (${storeIds.map(() => '?').join(',')})`
              params.push(...storeIds)
            }
            let whereYear = ''
            if (year) {
              whereYear = 'AND m.year = ?'
              params.push(year)
            }

            const sql = `
              SELECT m.store_id AS m_store_id, s.name AS store_name, m.year, m.month, m.pass_rate
              FROM category_store_monthly_passrate m
              JOIN stores s ON m.store_id = s.store_id
              WHERE m.category = ?
              ${whereStore}
              ${whereYear}
              ORDER BY m.year, m.month, m.store_id
            `
            const stmt = db.prepare(sql)
            const rows = stmt.all(...params)

            const labels = Array.from(new Set(rows.map(r => `${r.year}-${String(r.month).padStart(2, '0')}`))).sort()
            const labelIndex = {}
            labels.forEach((lbl, i) => { labelIndex[lbl] = i })

            const datasets = {}
            for (const r of rows) {
              const sid = r.m_store_id
              const name = r.store_name
              if (!datasets[sid]) {
                datasets[sid] = {
                  label: name,
                  data: new Array(labels.length).fill(null),
                  borderColor: STORE_COLORS[sid] || `hsl(${(sid * 60) % 360}, 70%, 50%)`,
                  fill: false
                }
              }
              const lbl = `${r.year}-${String(r.month).padStart(2, '0')}`
              datasets[sid].data[labelIndex[lbl]] = r.pass_rate !== null ? Number(r.pass_rate) : null
            }

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ labels, datasets: Object.values(datasets) }))
            return
          } catch (err) {
            console.error('Error handling category passrate:', err)
            next()
            return
          }
        }

        // 6. Store Passrate: /api/store/:storeId/passrate
        const storePassrateMatch = pathname.match(/^\/api\/store\/([^/]+)\/passrate$/)
        if (storePassrateMatch) {
          try {
            const sid = parseInt(storePassrateMatch[1], 10)
            const yearParam = query.get('year')
            const year = yearParam ? parseInt(yearParam, 10) : null

            let whereYear = ''
            const params = [sid]
            if (year) {
              whereYear = 'AND m.year = ?'
              params.push(year)
            }

            const sql = `
              SELECT m.category, m.year, m.month, m.pass_rate
              FROM category_store_monthly_passrate m
              WHERE m.store_id = ?
              ${whereYear}
              ORDER BY m.year, m.month, m.category
            `
            const stmt = db.prepare(sql)
            const rows = stmt.all(...params)

            const labels = Array.from(new Set(rows.map(r => `${r.year}-${String(r.month).padStart(2, '0')}`))).sort()
            const labelIndex = {}
            labels.forEach((lbl, i) => { labelIndex[lbl] = i })

            const datasets = {}
            for (const r of rows) {
              const cat = r.category
              if (!datasets[cat]) {
                datasets[cat] = {
                  label: cat,
                  data: new Array(labels.length).fill(null),
                  borderColor: CATEGORY_COLORS[cat] || '#8884d8',
                  fill: false
                }
              }
              const lbl = `${r.year}-${String(r.month).padStart(2, '0')}`
              datasets[cat].data[labelIndex[lbl]] = r.pass_rate !== null ? Number(r.pass_rate) : null
            }

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ labels, datasets: Object.values(datasets) }))
            return
          } catch (err) {
            console.error('Error handling store passrate:', err)
            next()
            return
          }
        }

        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), localAuditApiPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://audit.birmas.id',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
