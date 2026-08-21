export const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0f172a',
      titleColor: '#fff',
      bodyColor: '#fff',
      padding: 8,
      cornerRadius: 6
    }
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#6b7280' } },
    y: {
      grid: { color: 'rgba(15,23,42,0.06)', borderDash: [4,4] },
      ticks: { color: '#6b7280' }
    }
  }
}

export const barDataset = (data) => ({
  label: 'Count',
  data,
  backgroundColor: '#ef4444',
  borderRadius: 6,
  barPercentage: 0.7,
  categoryPercentage: 0.8
})
