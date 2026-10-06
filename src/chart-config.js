// src/chart-config.js
export const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: '#334155',   // slate-700 for light panels
        boxWidth: 16,
        padding: 12,
        font: { size: 12, weight: '500' }
      }
    },
    title: {
      display: true,
      text: '',             // ChartCard can override with category name
      color: '#0f172a',     // slate-900
      font: { size: 14, weight: 'bold' },
      padding: { top: 8, bottom: 8 }
    },
    tooltip: {
      backgroundColor: '#0f172a',
      titleColor: '#fff',
      bodyColor: '#e2e8f0',
      borderColor: '#334155',
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      displayColors: true
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(148, 163, 184, 0.12)' },
      ticks: { color: '#64748b', font: { size: 11, weight: '500' } }
    },
    y: {
      grid: { color: 'rgba(148, 163, 184, 0.15)', borderDash: [4,4] },
      ticks: { color: '#64748b', font: { size: 11, weight: '500' } }
    }
  }
}

export const barDataset = (data, label = 'Count') => ({
  label,
  data,
  backgroundColor: '#0d9488', // tosca / teal for bars
  borderRadius: 6,
  barPercentage: 0.7,
  categoryPercentage: 0.8
})

