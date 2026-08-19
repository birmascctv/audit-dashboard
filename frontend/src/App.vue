<template>
  <div>
    <h1>Audit Dashboard</h1>
    <button @click="load2025">Load 2025</button>
    <button @click="loadOthers">Load Others</button>
    <canvas id="chart"></canvas>
  </div>
</template>

<script setup>
import axios from 'axios';
import { Chart } from 'chart.js/auto';

let chart;

async function load2025() {
  const res = await axios.get('http://localhost:3000/api/median/2025');
  renderChart(res.data);
}

async function loadOthers() {
  const res = await axios.get('http://localhost:3000/api/median/others');
  renderChart(res.data);
}

function renderChart(data) {
  const labels = [...new Set(data.map(d => d.month))].sort((a,b)=>a-b);
  const datasets = [];

  const categories = [...new Set(data.map(d => d.category))];
  categories.forEach(cat => {
    const catData = labels.map(m => {
      const entry = data.find(d => d.category === cat && d.month === m);
      return entry ? entry.median : null;
    });
    datasets.push({
      label: cat,
      data: catData,
      borderColor: getRandomColor(),
      fill: false
    });
  });

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('chart'), {
    type: 'line',
    data: { labels, datasets }
  });
}

function getRandomColor() {
  return '#' + Math.floor(Math.random()*16777215).toString(16);
}
</script>
