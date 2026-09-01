// src/chart-config.js
export const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: '#f1f5f9',   // light text for dark panels
        boxWidth: 18,
        padding: 12,
        font: { size: 12 }
      }
    },
    title: {
      display: true,
      text: '',             // ChartCard can override with category name
      color: '#f1f5f9',
      font: { size: 14, weight: 'bold' },
      padding: { top: 10, bottom: 10 }
    },
    tooltip: {
      backgroundColor: '#374151',
      titleColor: '#fff',
      bodyColor: '#fff',
      padding: 10,
      cornerRadius: 8,
      displayColors: true
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.05)' },
      ticks: { color: '#9ca3af', font: { size: 11 } }
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.08)', borderDash: [4,4] },
      ticks: { color: '#9ca3af', font: { size: 11 } }
    }
  }
}

export const barDataset = (data, label = 'Count') => ({
  label,
  data,
  backgroundColor: '#6b7280', // grey for bars
  borderRadius: 6,
  barPercentage: 0.7,
  categoryPercentage: 0.8
})
