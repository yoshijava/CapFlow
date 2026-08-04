// CapFlow - Interactive Stock Market Sliding Window Capital Flow Tracker
let rawData = null;
let dates = [];
let tickers = {};
let series = {};

// Application State
let currentState = {
  windowSize: 10, // Default 10 trading days
  dateIndex: 0,
  isPlaying: false,
  playSpeed: 1, // 1x, 2x, 4x
  timer: null,
  activeTab: 'sectors', // 'sectors', 'countries', 'matrix', 'race'
  categoryFilter: 'all'
};

// ECharts Instance
let mainChart = null;

// Color Palette
const COLOR_INFLOW = '#10b981';
const COLOR_OUTFLOW = '#f43f5e';
const COLOR_CYAN = '#00f0ff';

// Country 5-Continent Geographic Coordinates
const COUNTRY_GEO = {
  "SPY": { continent: "北美洲 (North America)", coord: [-95.71, 37.09] },
  "EWC": { continent: "北美洲 (North America)", coord: [-106.34, 56.13] },
  "EWZ": { continent: "南美洲 (South America)", coord: [-51.92, -14.23] },
  "EWG": { continent: "歐洲 (Europe)", coord: [10.45, 51.16] },
  "EWU": { continent: "歐洲 (Europe)", coord: [-3.43, 55.37] },
  "EWJ": { continent: "亞洲 (Asia)", coord: [138.25, 36.20] },
  "FXI": { continent: "亞洲 (Asia)", coord: [104.19, 35.86] },
  "EWT": { continent: "亞洲 (Asia)", coord: [120.96, 23.69] },
  "INDA": { continent: "亞洲 (Asia)", coord: [78.96, 20.59] },
  "EWA": { continent: "大洋洲 (Oceania)", coord: [133.77, -25.27] },
  "EEM": { continent: "新興市場 (Global Emerging)", coord: [20.0, 0.0] }
};

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  try {
    const resp = await fetch('data.json');
    if (!resp.ok) throw new Error('Cannot load data.json');
    rawData = await resp.json();
    
    dates = rawData.metadata.dates;
    tickers = rawData.metadata.tickers;
    series = rawData.series;
    
    currentState.dateIndex = dates.length - 1;
    
    setupUIControls();
    initECharts();
    updateDashboard(true); // Force reset on initial load
  } catch (err) {
    console.error('Initialization error:', err);
    document.getElementById('main-chart').innerHTML = 
      `<div style="color:#ef4444; padding:2rem; text-align:center;">
        <h3>資料載入失敗</h3>
        <p>${err.message}</p>
        <button onclick="location.reload()" style="margin-top:1rem; padding:0.5rem 1rem; background:#00f0ff; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">重新載入</button>
      </div>`;
  }
}

function setupUIControls() {
  const windowBtns = document.querySelectorAll('.window-selector .btn-option');
  windowBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      windowBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentState.windowSize = parseInt(btn.dataset.window, 10);
      updateDashboard(true);
    });
  });

  const slider = document.getElementById('timeline-slider');
  slider.min = 0;
  slider.max = dates.length - 1;
  slider.value = currentState.dateIndex;
  
  slider.addEventListener('input', (e) => {
    currentState.dateIndex = parseInt(e.target.value, 10);
    if (currentState.isPlaying) pausePlayback();
    updateDashboard(false);
  });

  const playBtn = document.getElementById('play-btn');
  playBtn.addEventListener('click', () => {
    if (currentState.isPlaying) pausePlayback();
    else startPlayback();
  });

  const speedSelect = document.getElementById('speed-select');
  speedSelect.addEventListener('change', (e) => {
    currentState.playSpeed = parseFloat(e.target.value);
    if (currentState.isPlaying) {
      pausePlayback();
      startPlayback();
    }
  });

  const tabs = document.querySelectorAll('.view-tabs .tab-item');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentState.activeTab = tab.dataset.tab;
      updateChartLayout(null, null, true); // Force reset on tab switch
    });
  });
  
  document.getElementById('refresh-btn').addEventListener('click', () => location.reload());
}

function getStepInterval() {
  return Math.round(800 / currentState.playSpeed);
}

function getAnimDuration() {
  return Math.round(320 / currentState.playSpeed);
}

function startPlayback() {
  currentState.isPlaying = true;
  const playBtn = document.getElementById('play-btn');
  playBtn.classList.add('playing');
  playBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg> 暫停
  `;
  
  const stepTime = getStepInterval();
  currentState.timer = setInterval(() => {
    if (currentState.dateIndex < dates.length - 1) {
      currentState.dateIndex++;
      document.getElementById('timeline-slider').value = currentState.dateIndex;
      updateDashboard(false);
    } else {
      pausePlayback();
    }
  }, stepTime);
}

function pausePlayback() {
  currentState.isPlaying = false;
  if (currentState.timer) clearInterval(currentState.timer);
  const playBtn = document.getElementById('play-btn');
  playBtn.classList.remove('playing');
  playBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg> 動態播放
  `;
}

function getCalculatedWindowMetrics(symbol, endIndex, windowSize) {
  const symbolRecords = series[symbol] || [];
  if (symbolRecords.length === 0 || endIndex < 0) return null;
  
  const startIndex = Math.max(0, endIndex - windowSize + 1);
  const targetRecords = symbolRecords.slice(startIndex, endIndex + 1);
  if (targetRecords.length === 0) return null;

  let totalNetFlow = 0;
  let totalDollarVol = 0;
  let startPrice = targetRecords[0].open;
  let endPrice = targetRecords[targetRecords.length - 1].close;

  targetRecords.forEach(r => {
    totalNetFlow += r.net_flow;
    totalDollarVol += r.dollar_vol;
  });

  const priceReturn = ((endPrice - startPrice) / startPrice) * 100;
  const flowIntensity = totalDollarVol > 0 ? (totalNetFlow / totalDollarVol) * 100 : 0;

  return {
    symbol,
    meta: tickers[symbol],
    startPrice,
    endPrice,
    priceReturn,
    totalNetFlow,
    totalDollarVol,
    flowIntensity,
    daysCount: targetRecords.length
  };
}

function updateDashboard(forceReset = false) {
  const currentDateStr = dates[currentState.dateIndex];
  const windowDays = currentState.windowSize;
  const startDateStr = dates[Math.max(0, currentState.dateIndex - windowDays + 1)];

  document.getElementById('window-date-display').innerText = 
    `${startDateStr} 至 ${currentDateStr} (${windowDays} 交易日視窗)`;
  document.getElementById('current-date-badge').innerText = currentDateStr;

  const sectorMetrics = [];
  const countryMetrics = [];
  let marketNetFlowSum = 0;

  Object.keys(tickers).forEach(symbol => {
    const metric = getCalculatedWindowMetrics(symbol, currentState.dateIndex, windowDays);
    if (!metric) return;

    if (metric.meta.category === 'Sector') {
      sectorMetrics.push(metric);
    } else {
      countryMetrics.push(metric);
    }
    marketNetFlowSum += metric.totalNetFlow;
  });

  updateKPICards(sectorMetrics, countryMetrics, marketNetFlowSum);
  updateChartLayout(sectorMetrics, countryMetrics, forceReset);
  updateLeaderboard([...sectorMetrics, ...countryMetrics]);
}

function updateKPICards(sectorMetrics, countryMetrics, totalNetFlow) {
  sectorMetrics.sort((a, b) => b.totalNetFlow - a.totalNetFlow);
  const topInflowSector = sectorMetrics[0];
  const topOutflowSector = sectorMetrics[sectorMetrics.length - 1];

  const flowKpi = document.getElementById('kpi-total-flow');
  const formattedFlow = (totalNetFlow / 1e8).toFixed(2);
  flowKpi.innerText = `${totalNetFlow >= 0 ? '+' : ''}${formattedFlow} 億美元`;
  flowKpi.className = `kpi-value ${totalNetFlow >= 0 ? 'text-inflow' : 'text-outflow'}`;

  if (topInflowSector) {
    document.getElementById('kpi-top-sector').innerText = `${topInflowSector.meta.name.split(' ')[0]}`;
    document.getElementById('kpi-top-sector-sub').innerText = `淨流入 +${(topInflowSector.totalNetFlow / 1e8).toFixed(2)} 億 (${topInflowSector.priceReturn.toFixed(2)}%)`;
  }

  if (topOutflowSector) {
    document.getElementById('kpi-bottom-sector').innerText = `${topOutflowSector.meta.name.split(' ')[0]}`;
    document.getElementById('kpi-bottom-sector-sub').innerText = `淨流出 ${(topOutflowSector.totalNetFlow / 1e8).toFixed(2)} 億 (${topOutflowSector.priceReturn.toFixed(2)}%)`;
  }
}

function initECharts() {
  const chartDom = document.getElementById('main-chart');
  mainChart = echarts.init(chartDom, 'dark');
  window.addEventListener('resize', () => mainChart.resize());
}

function updateChartLayout(sectorMetrics = null, countryMetrics = null, forceReset = false) {
  const windowDays = currentState.windowSize;
  if (!sectorMetrics || !countryMetrics) {
    sectorMetrics = [];
    countryMetrics = [];
    Object.keys(tickers).forEach(symbol => {
      const metric = getCalculatedWindowMetrics(symbol, currentState.dateIndex, windowDays);
      if (!metric) return;
      if (metric.meta.category === 'Sector') sectorMetrics.push(metric);
      else countryMetrics.push(metric);
    });
  }

  if (currentState.activeTab === 'sectors') {
    renderTreemap(sectorMetrics, '美股產業板塊資金流向熱力圖 (Sector Treemap)', forceReset);
  } else if (currentState.activeTab === 'countries') {
    renderWorldContinentMap(countryMetrics, forceReset);
  } else if (currentState.activeTab === 'matrix') {
    renderQuadrantMatrix([...sectorMetrics, ...countryMetrics], forceReset);
  } else if (currentState.activeTab === 'race') {
    renderBarRace([...sectorMetrics, ...countryMetrics], forceReset);
  }
}

// 1. Sector Treemap View
function renderTreemap(metrics, titleText, forceReset = false) {
  const animDur = getAnimDuration();
  const data = metrics.map(m => {
    const isPositive = m.totalNetFlow >= 0;
    const flowBn = (m.totalNetFlow / 1e8).toFixed(2);
    const sectorName = m.meta.name.split(' ')[0];
    return {
      id: m.symbol,
      name: m.symbol,
      sectorName: sectorName,
      flowBn: flowBn,
      value: m.totalDollarVol,
      netFlow: m.totalNetFlow,
      priceReturn: m.priceReturn,
      flowIntensity: m.flowIntensity,
      symbol: m.symbol,
      itemStyle: {
        color: isPositive ? 
          echarts.color.lift('#10b981', -Math.min(0.5, Math.abs(m.flowIntensity) / 10)) : 
          echarts.color.lift('#f43f5e', -Math.min(0.5, Math.abs(m.flowIntensity) / 10))
      }
    };
  });

  const option = {
    backgroundColor: 'transparent',
    animationDurationUpdate: animDur,
    animationEasingUpdate: 'cubicOut',
    title: {
      text: titleText,
      subtext: `方塊面積 = 累積成交金額 | 顏色深淺 = 資金淨流向強弱 (${dates[currentState.dateIndex]})`,
      left: 'left',
      textStyle: { color: '#f3f4f6', fontSize: 16, fontFamily: 'Outfit' },
      subtextStyle: { color: '#9ca3af', fontSize: 12 }
    },
    tooltip: {
      formatter: (params) => {
        const d = params.data;
        if (!d) return '';
        return `
          <div style="padding:4px 8px;">
            <b style="font-size:14px; color:#00f0ff">${d.symbol} - ${d.sectorName}</b><br/>
            累積成交額: ${(d.value / 1e8).toFixed(2)} 億美元<br/>
            資金淨流向: <span style="color:${d.netFlow>=0?'#10b981':'#f43f5e'}">${(d.netFlow/1e8).toFixed(2)} 億美元</span><br/>
            視窗報酬率: <span style="color:${d.priceReturn>=0?'#10b981':'#f43f5e'}">${d.priceReturn.toFixed(2)}%</span>
          </div>
        `;
      }
    },
    series: [{
      type: 'treemap',
      data: data,
      width: '100%',
      height: '85%',
      top: '15%',
      roam: false,
      breadcrumb: { show: false },
      label: {
        show: true,
        position: 'inside',
        align: 'center',
        verticalAlign: 'middle',
        overflow: 'truncate',
        fontSize: 12,
        fontWeight: 'bold',
        color: '#ffffff',
        lineHeight: 16,
        formatter: (params) => {
          const d = params.data;
          if (!d) return '';
          const rect = params.rect || {};
          const w = rect.width || 100;
          const h = rect.height || 100;

          const sign = d.netFlow >= 0 ? '+' : '';
          const flowStr = `${sign}${d.flowBn}億`;
          const retStr = `(${sign}${d.priceReturn.toFixed(1)}%)`;

          // Ultra flat / narrow box (< 38px height)
          if (h < 38) {
            if (w < 80) return `${d.symbol}`;
            return `${d.symbol} ${d.sectorName} ${flowStr}`;
          }
          // Medium height box (< 65px height)
          if (h < 65) {
            return `${d.symbol} ${d.sectorName}\n${flowStr} ${retStr}`;
          }
          // Large spacious box
          return `${d.symbol}\n${d.sectorName}\n${flowStr} ${retStr}`;
        }
      },
      itemStyle: { borderColor: '#07090e', borderWidth: 2 }
    }]
  };

  mainChart.setOption(option, forceReset);
}

// 2. 五大洲全球地圖資金動向 (5-Continent World Geo Map)
function renderWorldContinentMap(countryMetrics, forceReset = false) {
  const animDur = getAnimDuration();
  const scatterData = countryMetrics.map(m => {
    const geoInfo = COUNTRY_GEO[m.symbol] || { continent: '其他', coord: [0, 0] };
    const flowBn = (m.totalNetFlow / 1e8).toFixed(2);
    return {
      id: m.symbol,
      name: `${m.meta.flag} ${m.symbol} - ${m.meta.name.split(' ')[0]}`,
      symbolName: m.symbol,
      continent: geoInfo.continent,
      value: [...geoInfo.coord, (m.totalDollarVol / 1e8).toFixed(1)],
      netFlow: m.totalNetFlow,
      priceReturn: m.priceReturn,
      flowBn: flowBn,
      itemStyle: {
        color: m.totalNetFlow >= 0 ? COLOR_INFLOW : COLOR_OUTFLOW,
        shadowBlur: 15,
        shadowColor: m.totalNetFlow >= 0 ? 'rgba(16,185,129,0.8)' : 'rgba(244,63,94,0.8)'
      }
    };
  });

  const option = {
    backgroundColor: 'transparent',
    animationDurationUpdate: animDur,
    animationEasingUpdate: 'cubicOut',
    title: {
      text: '全球五大洲資金動向地圖 (World Continents Capital Rotation)',
      subtext: '地理位置動態脈衝: 🟢 資金淨流入 (Inflow) | 🔴 資金淨流出 (Outflow) | 脈衝圈大小: 成交量規模',
      left: 'left',
      textStyle: { color: '#f3f4f6', fontSize: 16, fontFamily: 'Outfit' },
      subtextStyle: { color: '#9ca3af', fontSize: 12 }
    },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const d = params.data;
        if (!d) return '';
        const isPos = d.netFlow >= 0;
        return `
          <div style="padding:6px 10px;">
            <b style="font-size:15px; color:#00f0ff">${d.name}</b><br/>
            區域/洲別: <span style="color:#f59e0b">${d.continent}</span><br/>
            累積成交額: ${d.value[2]} 億美元<br/>
            資金淨流向: <span style="font-weight:bold; color:${isPos?'#10b981':'#f43f5e'}">${isPos?'+':''}${d.flowBn} 億美元</span><br/>
            視窗報酬率: <span style="font-weight:bold; color:${d.priceReturn>=0?'#10b981':'#f43f5e'}">${d.priceReturn>=0?'+':''}${d.priceReturn.toFixed(2)}%</span>
          </div>
        `;
      }
    },
    geo: {
      map: 'world',
      roam: true,
      zoom: 1.25,
      center: [15, 20],
      label: { show: false },
      itemStyle: {
        areaColor: 'rgba(20, 30, 48, 0.85)',
        borderColor: 'rgba(0, 240, 255, 0.25)',
        borderWidth: 1.2
      },
      emphasis: {
        itemStyle: {
          areaColor: 'rgba(0, 240, 255, 0.15)',
          borderColor: '#00f0ff'
        }
      }
    },
    series: [{
      name: '國家資金動向',
      type: 'effectScatter',
      coordinateSystem: 'geo',
      data: scatterData,
      symbolSize: (val) => Math.max(16, Math.min(45, val[2] / 2)),
      showEffectOn: 'render',
      rippleEffect: {
        brushType: 'stroke',
        scale: 3,
        period: 4
      },
      hoverAnimation: true,
      label: {
        show: true,
        formatter: (params) => {
          const d = params.data;
          return `{a|${d.symbolName}}\n{b|${d.netFlow>=0?'+':''}${d.flowBn}億}`;
        },
        position: 'right',
        distance: 8,
        rich: {
          a: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
          b: { color: '#00f0ff', fontSize: 10, fontFamily: 'JetBrains Mono' }
        }
      }
    }]
  };

  mainChart.setOption(option, forceReset);
}

// 3. 2D Quadrant Matrix View (Smooth Floating Bubbles)
function renderQuadrantMatrix(metrics, forceReset = false) {
  const animDur = getAnimDuration();
  const data = metrics.map(m => {
    const dollarVolBn = m.totalDollarVol / 1e8;
    const calcSize = Math.max(16, Math.min(50, dollarVolBn / 2));
    return {
      id: m.symbol,
      name: `${m.meta.flag ? m.meta.flag + ' ' : ''}${m.symbol}`,
      symbol: 'circle',
      symbolSize: calcSize,
      value: [
        parseFloat(m.flowIntensity.toFixed(2)),
        parseFloat(m.priceReturn.toFixed(2)),
        parseFloat(dollarVolBn.toFixed(1)),
        m.totalNetFlow
      ],
      assetSymbol: m.symbol,
      category: m.meta.category,
      itemStyle: {
        color: m.totalNetFlow >= 0 ? COLOR_INFLOW : COLOR_OUTFLOW,
        shadowBlur: 12,
        shadowColor: m.totalNetFlow >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(244,63,94,0.6)'
      }
    };
  });

  const option = {
    backgroundColor: 'transparent',
    animationDurationUpdate: animDur,
    animationEasingUpdate: 'cubicOut',
    title: {
      text: '資金動向 vs 視窗報酬率 (四象限矩陣分析)',
      subtext: 'X軸: 資金淨流向強度 (%) | Y軸: 視窗價格報酬率 (%) | 圓圈大小: 成交量規模',
      left: 'left',
      textStyle: { color: '#f3f4f6', fontSize: 16, fontFamily: 'Outfit' },
      subtextStyle: { color: '#9ca3af', fontSize: 12 }
    },
    grid: { left: '8%', right: '8%', top: '18%', bottom: '12%' },
    tooltip: {
      formatter: (params) => {
        const d = params.data;
        return `
          <div style="padding:4px;">
            <b>${d.name} (${d.category})</b><br/>
            資金流向強度 (X): ${d.value[0]}%<br/>
            價格報酬率 (Y): ${d.value[1]}%<br/>
            淨流向金額: ${(d.value[3]/1e8).toFixed(2)} 億美元
          </div>
        `;
      }
    },
    xAxis: {
      name: '資金淨流向強度 (%)',
      nameLocation: 'middle',
      nameGap: 30,
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } },
      axisLine: { lineStyle: { color: '#00f0ff', width: 2 } }
    },
    yAxis: {
      name: '價格報酬率 (%)',
      nameLocation: 'middle',
      nameGap: 40,
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } },
      axisLine: { lineStyle: { color: '#00f0ff', width: 2 } }
    },
    series: [{
      type: 'scatter',
      symbol: 'circle',
      data: data,
      label: {
        show: true,
        formatter: '{b}',
        position: 'top',
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 'bold'
      },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: 'rgba(255,255,255,0.25)', width: 1.5 },
        data: [{ xAxis: 0 }, { yAxis: 0 }]
      }
    }]
  };

  mainChart.setOption(option, forceReset);
}

// 4. Bar Race View (60FPS Realtime Ranking Morphing)
function renderBarRace(metrics, forceReset = false) {
  const animDur = getAnimDuration();
  metrics.sort((a, b) => a.totalNetFlow - b.totalNetFlow);

  const categories = metrics.map(m => `${m.meta.flag ? m.meta.flag + ' ' : ''}${m.symbol} ${m.meta.name.split(' ')[0]}`);
  const values = metrics.map(m => (m.totalNetFlow / 1e8).toFixed(2));
  const colors = metrics.map(m => m.totalNetFlow >= 0 ? COLOR_INFLOW : COLOR_OUTFLOW);

  const option = {
    backgroundColor: 'transparent',
    animationDurationUpdate: animDur,
    animationEasingUpdate: 'linear',
    title: {
      text: '資金淨流向動態排行榜 (Net Flow Leaderboard)',
      subtext: `當前視窗 (${currentState.windowSize} 交易日) 累積淨流入 / 淨流出金額 (億美元)`,
      left: 'left',
      textStyle: { color: '#f3f4f6', fontSize: 16, fontFamily: 'Outfit' },
      subtextStyle: { color: '#9ca3af', fontSize: 12 }
    },
    grid: { left: '20%', right: '10%', top: '15%', bottom: '8%' },
    xAxis: {
      type: 'value',
      name: '金額 (億美元)',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } }
    },
    yAxis: {
      type: 'category',
      data: categories,
      realtimeSort: true,
      axisLabel: { color: '#f3f4f6', fontSize: 11, fontWeight: 'bold' }
    },
    series: [{
      type: 'bar',
      realtimeSort: true,
      data: values.map((v, i) => ({
        value: v,
        itemStyle: { color: colors[i], borderRadius: [0, 4, 4, 0] }
      })),
      label: {
        show: true,
        position: 'right',
        formatter: '{c} 億',
        color: '#ffffff',
        fontWeight: 'bold'
      }
    }]
  };

  mainChart.setOption(option, forceReset);
}

function updateLeaderboard(metrics) {
  const listEl = document.getElementById('leaderboard-list');
  metrics.sort((a, b) => b.totalNetFlow - a.totalNetFlow);

  listEl.innerHTML = metrics.map((m, idx) => {
    const isPos = m.totalNetFlow >= 0;
    const flowBn = (m.totalNetFlow / 1e8).toFixed(2);
    const retPct = m.priceReturn.toFixed(2);

    return `
      <div class="rank-item" onclick="openDetailModal('${m.symbol}')">
        <div class="rank-info">
          <div class="rank-badge">${idx + 1}</div>
          <div>
            <div class="rank-name">${m.meta.flag ? m.meta.flag + ' ' : ''}${m.symbol}</div>
            <div style="font-size:0.75rem; color:#9ca3af">${m.meta.name.split(' ')[0]}</div>
          </div>
        </div>
        <div class="rank-metrics">
          <div class="rank-flow ${isPos ? 'text-inflow' : 'text-outflow'}">${isPos ? '+' : ''}${flowBn} 億</div>
          <div class="rank-return ${m.priceReturn >= 0 ? 'text-inflow' : 'text-outflow'}">${m.priceReturn >= 0 ? '+' : ''}${retPct}%</div>
        </div>
      </div>
    `;
  }).join('');
}

function openDetailModal(symbol) {
  const meta = tickers[symbol];
  const symbolRecords = series[symbol] || [];
  if (!symbolRecords.length) return;

  const modal = document.getElementById('detail-modal');
  document.getElementById('modal-title').innerText = `${meta.flag ? meta.flag + ' ' : ''}${symbol} - ${meta.name}`;
  modal.classList.add('active');

  const modalChartDom = document.getElementById('modal-chart');
  const modalChart = echarts.init(modalChartDom, 'dark');

  const chartDates = symbolRecords.map(r => r.date);
  const closePrices = symbolRecords.map(r => r.close);
  const netFlows = symbolRecords.map(r => (r.net_flow / 1e8).toFixed(2));

  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '8%', right: '5%', top: '15%', bottom: '15%' },
    xAxis: { type: 'category', data: chartDates },
    yAxis: [
      { type: 'value', name: '收盤價 ($)', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
      { type: 'value', name: '日淨流向 (億美元)', splitLine: { show: false } }
    ],
    series: [
      {
        name: '收盤價',
        type: 'line',
        data: closePrices,
        smooth: true,
        lineStyle: { color: '#00f0ff', width: 2.5 }
      },
      {
        name: '日淨流向',
        type: 'bar',
        yAxisIndex: 1,
        data: netFlows.map(v => ({
          value: v,
          itemStyle: { color: v >= 0 ? COLOR_INFLOW : COLOR_OUTFLOW }
        }))
      }
    ]
  };

  modalChart.setOption(option);
}

function closeModal() {
  document.getElementById('detail-modal').classList.remove('active');
}
