// Factor Analytics Engine for Individual Stocks
let factorRawData = null;
let factorMetadata = null;
let stockAnalysis = {};

let currentFactorState = {
  activeSymbol: 'GOOG',
  activeTab: 'heatmap' // 'heatmap', 'timeline', 'betas', 'simulator'
};

let factorChart = null;

// Color Palette
const COLOR_POS = '#10b981';
const COLOR_NEG = '#f43f5e';
const COLOR_CYAN = '#00f0ff';

document.addEventListener('DOMContentLoaded', () => {
  initFactorApp();
});

async function initFactorApp() {
  try {
    const resp = await fetch('factor_data.json');
    if (!resp.ok) throw new Error('Cannot load factor_data.json');
    factorRawData = await resp.json();
    
    factorMetadata = factorRawData.metadata;
    stockAnalysis = factorRawData.stock_analysis;
    
    setupFactorControls();
    initFactorEChart();
    updateFactorDashboard();
  } catch (err) {
    console.error('Factor Analytics initialization error:', err);
    document.getElementById('factor-chart').innerHTML = `
      <div style="color:#ef4444; padding:2rem; text-align:center;">
        <h3>數據載入失敗</h3>
        <p>${err.message}</p>
        <button onclick="location.reload()" style="margin-top:1rem; padding:0.5rem 1rem; background:#00f0ff; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">重新載入</button>
      </div>`;
  }
}

function setupFactorControls() {
  // Stock selector buttons
  const stockBtns = document.querySelectorAll('#stock-selector-group .btn-option');
  stockBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      stockBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFactorState.activeSymbol = btn.dataset.symbol;
      updateFactorDashboard();
    });
  });

  // Tab switching
  const tabs = document.querySelectorAll('.view-tabs .tab-item');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFactorState.activeTab = tab.dataset.tab;
      
      const simBox = document.getElementById('simulator-controls');
      if (currentFactorState.activeTab === 'simulator') {
        simBox.style.display = 'block';
      } else {
        simBox.style.display = 'none';
      }
      
      renderFactorChart();
    });
  });

  // Simulator Sliders
  const sliders = ['sim-spy', 'sim-tnx', 'sim-vix', 'sim-oil'];
  sliders.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      updateSimulatorValues();
      if (currentFactorState.activeTab === 'simulator') {
        renderSimulatorView();
      }
    });
  });
  
  document.getElementById('refresh-factor-btn').addEventListener('click', () => location.reload());
}

function updateSimulatorValues() {
  const spyVal = parseFloat(document.getElementById('sim-spy').value);
  const tnxVal = parseFloat(document.getElementById('sim-tnx').value);
  const vixVal = parseFloat(document.getElementById('sim-vix').value);
  const oilVal = parseFloat(document.getElementById('sim-oil').value);

  document.getElementById('val-sim-spy').innerText = `${spyVal >= 0 ? '+' : ''}${spyVal.toFixed(1)}%`;
  document.getElementById('val-sim-tnx').innerText = `${tnxVal >= 0 ? '+' : ''}${tnxVal} bps`;
  document.getElementById('val-sim-vix').innerText = `${vixVal >= 0 ? '+' : ''}${vixVal.toFixed(1)}%`;
  document.getElementById('val-sim-oil').innerText = `${oilVal >= 0 ? '+' : ''}${oilVal.toFixed(1)}%`;
}

function initFactorEChart() {
  const chartDom = document.getElementById('factor-chart');
  factorChart = echarts.init(chartDom, 'dark');
  window.addEventListener('resize', () => factorChart.resize());
}

function updateFactorDashboard() {
  const sym = currentFactorState.activeSymbol;
  const analysis = stockAnalysis[sym];
  const stockMeta = factorMetadata.stocks[sym];
  if (!analysis) return;

  // KPI calculations
  const retHist = analysis.return_history;
  const cumulativeRet = retHist.reduce((acc, r) => acc + r, 0); // Approx sum return
  const spyBeta = analysis.factor_betas['SPY'] || 0.0;

  // Sort correlations to find top positive & top inverse factor
  const corrs = analysis.pearson_correlations;
  const sortedFactors = Object.keys(corrs).sort((a, b) => corrs[b] - corrs[a]);
  const topPos = sortedFactors[0];
  const topNeg = sortedFactors[sortedFactors.length - 1];

  document.getElementById('kpi-stock-ret').innerText = `${cumulativeRet >= 0 ? '+' : ''}${cumulativeRet.toFixed(1)}%`;
  document.getElementById('kpi-stock-ret').className = `kpi-value ${cumulativeRet >= 0 ? 'text-inflow' : 'text-outflow'}`;
  document.getElementById('kpi-stock-name').innerText = `${stockMeta.flag} ${sym} - ${stockMeta.name}`;

  document.getElementById('kpi-beta-spy').innerText = `${spyBeta > 0 ? '+' : ''}${spyBeta.toFixed(2)}`;

  if (topPos) {
    const posMeta = factorMetadata.factors[topPos];
    document.getElementById('kpi-top-pos-factor').innerText = `${posMeta ? posMeta.name.split(' ')[0] : topPos}`;
    document.getElementById('kpi-top-pos-val').innerText = `相關係數: +${corrs[topPos].toFixed(2)}`;
  }

  if (topNeg) {
    const negMeta = factorMetadata.factors[topNeg];
    document.getElementById('kpi-top-neg-factor').innerText = `${negMeta ? negMeta.name.split(' ')[0] : topNeg}`;
    document.getElementById('kpi-top-neg-val').innerText = `相關係數: ${corrs[topNeg].toFixed(2)}`;
  }

  renderFactorChart();
  updateFactorSidebarList();
}

function renderFactorChart() {
  if (currentFactorState.activeTab === 'heatmap') {
    renderHeatmapView();
  } else if (currentFactorState.activeTab === 'timeline') {
    renderRollingTimelineView();
  } else if (currentFactorState.activeTab === 'betas') {
    renderBetasView();
  } else if (currentFactorState.activeTab === 'simulator') {
    renderSimulatorView();
  }
}

// 1. Correlation Heatmap Matrix View
function renderHeatmapView() {
  const sym = currentFactorState.activeSymbol;
  const analysis = stockAnalysis[sym];
  if (!analysis) return;

  const symbols = analysis.matrix_symbols; // [stock, SPY, QQQ, ...]
  const matrix = analysis.correlation_matrix;

  // Flatten matrix into ECharts heatmap data format [x, y, value]
  const heatmapData = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = 0; j < symbols.length; j++) {
      heatmapData.push([i, j, matrix[i][j]]);
    }
  }

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `${sym} 多因子相關性矩陣熱力圖 (Correlation Heatmap Matrix)`,
      subtext: '數值介於 -1.0 (強負相關/反向) 至 +1.0 (強正相關/同向)',
      left: 'left',
      textStyle: { color: '#f3f4f6', fontSize: 16, fontFamily: 'Outfit' },
      subtextStyle: { color: '#9ca3af', fontSize: 12 }
    },
    tooltip: {
      position: 'top',
      formatter: (params) => {
        const xSym = symbols[params.data[0]];
        const ySym = symbols[params.data[1]];
        const val = params.data[2];
        return `<b>${xSym} vs ${ySym}</b><br/>皮爾森相關係數: <span style="font-weight:bold; color:${val>=0?'#10b981':'#f43f5e'}">${val >= 0 ? '+' : ''}${val}</span>`;
      }
    },
    grid: { left: '12%', right: '6%', top: '16%', bottom: '24%' },
    xAxis: {
      type: 'category',
      data: symbols,
      splitArea: { show: true },
      axisLabel: { color: '#00f0ff', fontWeight: 'bold', interval: 0, fontSize: 11 }
    },
    yAxis: {
      type: 'category',
      data: symbols,
      splitArea: { show: true },
      axisLabel: { color: '#00f0ff', fontWeight: 'bold', fontSize: 11 }
    },
    visualMap: {
      min: -1.0,
      max: 1.0,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '1%',
      itemWidth: 15,
      itemHeight: 140,
      inRange: {
        color: ['#f43f5e', '#1e293b', '#10b981']
      },
      textStyle: { color: '#9ca3af', fontSize: 11 }
    },
    series: [{
      name: 'Correlation',
      type: 'heatmap',
      data: heatmapData,
      label: {
        show: true,
        formatter: (p) => p.data[2].toFixed(2),
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 11
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 240, 255, 0.8)'
        }
      }
    }]
  };

  factorChart.setOption(option, true);
}

// 2. Rolling 60D Correlation Timeline View
function renderRollingTimelineView() {
  const sym = currentFactorState.activeSymbol;
  const analysis = stockAnalysis[sym];
  if (!analysis) return;

  const dates = factorMetadata.dates;
  const rollingCorrs = analysis.rolling_correlations_60d;

  const seriesList = Object.keys(rollingCorrs).map(factorSym => {
    const meta = factorMetadata.factors[factorSym];
    return {
      name: meta ? meta.name.split(' ')[0] : factorSym,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: rollingCorrs[factorSym],
      lineStyle: { width: 2 }
    };
  });

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `${sym} 近 1 年因子 60日滾動相關性走勢 (Rolling Correlation Timeline)`,
      subtext: '觀察各因子對個股影響力何時增強或減弱',
      left: 'left',
      textStyle: { color: '#f3f4f6', fontSize: 16, fontFamily: 'Outfit' },
      subtextStyle: { color: '#9ca3af', fontSize: 12 }
    },
    legend: {
      top: '10%',
      textStyle: { color: '#f3f4f6', fontSize: 11 }
    },
    grid: { left: '6%', right: '4%', top: '22%', bottom: '10%' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: '#9ca3af' } }
    },
    yAxis: {
      type: 'value',
      min: -1.0,
      max: 1.0,
      name: '相關係數 (-1 至 +1)',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } }
    },
    series: seriesList
  };

  factorChart.setOption(option, true);
}

// 3. Factor Beta Sensitivity View
function renderBetasView() {
  const sym = currentFactorState.activeSymbol;
  const analysis = stockAnalysis[sym];
  if (!analysis) return;

  const betas = analysis.factor_betas;
  const sortedFactors = Object.keys(betas).sort((a, b) => betas[a] - betas[b]);

  const categories = sortedFactors.map(f => {
    const meta = factorMetadata.factors[f];
    return meta ? meta.name : f;
  });

  const values = sortedFactors.map(f => betas[f]);
  const colors = values.map(v => v >= 0 ? COLOR_POS : COLOR_NEG);

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `${sym} 各因子敏感度迴歸 Beta (β)`,
      subtext: '量化意義: 該因子變動 +1% 時，預期個股變動的百分比 (%)',
      left: 'left',
      textStyle: { color: '#f3f4f6', fontSize: 16, fontFamily: 'Outfit' },
      subtextStyle: { color: '#9ca3af', fontSize: 12 }
    },
    grid: { left: '25%', right: '10%', top: '18%', bottom: '10%' },
    xAxis: {
      type: 'value',
      name: 'Beta 系數',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } }
    },
    yAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: '#ffffff', fontWeight: 'bold' }
    },
    series: [{
      type: 'bar',
      data: values.map((v, idx) => ({
        value: v,
        itemStyle: { color: colors[idx], borderRadius: [0, 4, 4, 0] }
      })),
      label: {
        show: true,
        position: 'right',
        formatter: (p) => `${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}`,
        color: '#ffffff',
        fontWeight: 'bold'
      }
    }]
  };

  factorChart.setOption(option, true);
}

// 4. Factor Scenario Simulator View
function renderSimulatorView() {
  const sym = currentFactorState.activeSymbol;
  const analysis = stockAnalysis[sym];
  if (!analysis) return;

  const spyVal = parseFloat(document.getElementById('sim-spy').value);
  const tnxVal = parseFloat(document.getElementById('sim-tnx').value) / 100; // convert bps to %
  const vixVal = parseFloat(document.getElementById('sim-vix').value);
  const oilVal = parseFloat(document.getElementById('sim-oil').value);

  const spyBeta = analysis.factor_betas['SPY'] || 0.0;
  const tnxBeta = analysis.factor_betas['^TNX'] || 0.0;
  const vixBeta = analysis.factor_betas['^VIX'] || 0.0;
  const oilBeta = analysis.factor_betas['CL=F'] || 0.0;

  const predictedImpact = (spyVal * spyBeta) + (tnxVal * tnxBeta) + (vixVal * vixBeta) + (oilVal * oilBeta);
  const isPos = predictedImpact >= 0;

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `${sym} 多因子情境模擬結果 (Scenario Impact Prediction)`,
      subtext: `預估 ${sym} 股價衝擊: ${isPos ? '+' : ''}${predictedImpact.toFixed(2)}%`,
      left: 'left',
      textStyle: { color: '#f3f4f6', fontSize: 16, fontFamily: 'Outfit' },
      subtextStyle: { color: isPos ? COLOR_POS : COLOR_NEG, fontSize: 15, fontWeight: 'bold' }
    },
    series: [{
      type: 'gauge',
      center: ['50%', '62%'],
      radius: '90%',
      startAngle: 180,
      endAngle: 0,
      min: -15,
      max: 15,
      splitNumber: 6,
      itemStyle: {
        color: isPos ? COLOR_POS : COLOR_NEG
      },
      progress: {
        show: true,
        width: 18
      },
      pointer: {
        icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '55%',
        width: 8,
        offsetCenter: [0, '-10%'],
        itemStyle: { color: '#00f0ff' }
      },
      axisLine: {
        lineStyle: { width: 18, color: [[0.5, '#f43f5e'], [1, '#10b981']] }
      },
      axisTick: { distance: 10, length: 6, lineStyle: { color: 'rgba(255,255,255,0.3)', width: 1 } },
      splitLine: { distance: 10, length: 12, lineStyle: { color: '#00f0ff', width: 2 } },
      axisLabel: {
        distance: 18,
        color: '#9ca3af',
        fontSize: 11,
        formatter: (v) => `${v}%`
      },
      title: {
        show: true,
        offsetCenter: [0, '45%'],
        color: '#9ca3af',
        fontSize: 13,
        fontWeight: 'bold'
      },
      detail: {
        valueAnimation: true,
        formatter: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
        color: isPos ? COLOR_POS : COLOR_NEG,
        fontSize: 32,
        fontFamily: 'Outfit',
        fontWeight: 'bold',
        offsetCenter: [0, '15%']
      },
      data: [{ value: parseFloat(predictedImpact.toFixed(2)), name: `預估 ${sym} 股價受因子衝擊 %` }]
    }]
  };

  factorChart.setOption(option, true);
}

function updateFactorSidebarList() {
  const listEl = document.getElementById('factor-list-panel');
  const sym = currentFactorState.activeSymbol;
  const analysis = stockAnalysis[sym];
  if (!analysis) return;

  const corrs = analysis.pearson_correlations;
  const betas = analysis.factor_betas;

  listEl.innerHTML = Object.keys(factorMetadata.factors).map(facKey => {
    const meta = factorMetadata.factors[facKey];
    const corr = corrs[facKey] || 0.0;
    const beta = betas[facKey] || 0.0;
    const isPos = corr >= 0;

    return `
      <div class="rank-item" style="cursor:default;">
        <div>
          <div class="rank-name" style="color:var(--accent-cyan)">${meta.name}</div>
          <div style="font-size:0.75rem; color:#9ca3af">${meta.desc}</div>
        </div>
        <div class="rank-metrics">
          <div class="rank-flow ${isPos ? 'text-inflow' : 'text-outflow'}">Corr: ${isPos ? '+' : ''}${corr.toFixed(2)}</div>
          <div class="rank-return" style="color:var(--text-muted)">Beta: ${beta >= 0 ? '+' : ''}${beta.toFixed(2)}</div>
        </div>
      </div>
    `;
  }).join('');
}
