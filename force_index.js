const SYMBOLS = [
    'AAPL', 'MSFT', 'AMZN', 'NVDA', 'META', 'AVGO', 'TSLA', 'GOOGL', 'GOOG', 'COST', 
    'PEP', 'AMD', 'TMUS', 'NFLX', 'CSCO', 'INTC', 'ADBE', 'QCOM', 'TXN', 'AMGN', 
    'INTU', 'HON', 'AMAT', 'ISRG', 'CMCSA', 'BKNG', 'SBUX', 'GILD', 'VRTX', 'MDLZ', 
    'LRCX', 'REGN', 'ADP', 'MU', 'PANW', 'MELI', 'KLAC', 'SNPS', 'CDNS', 'CSX', 
    'MAR', 'PYPL', 'CTAS', 'ORLY', 'ABNB', 'MNST', 'PCAR', 'LULU', 'ASML', 'CRWD', 
    'NXPI', 'FTNT', 'DXCM', 'ADSK', 'MCHP', 'CHTR', 'KDP', 'PAYX', 'IDXX', 'ODFL', 
    'ROST', 'KHC', 'MRVL', 'CPRT', 'EXC', 'EA', 'WBD', 'FAST', 'FANG', 'CTSH', 
    'BIIB', 'CEG', 'VRSK', 'ZS', 'CTRA', 'EBAY', 'ILMN', 'SIRI', 'SGEN', 'WBA', 
    'JD', 'PDD', 'ALGN', 'TEAM', 'NTES', 'ZM', 'DOCU', 'SPLK', 'OKTA', 'SWKS', 
    'CDW', 'CHKP', 'DLTR', 'ENPH', 'EXPE', 'INCY', 'LCID', 'PTON', 'VRSN'
];



const gridContainer = document.getElementById('market-grid');
const logContainer = document.getElementById('execution-logs');
const clockElement = document.getElementById('clock');
const lastUpdateElement = document.getElementById('last-update');
const marketsScannedElement = document.getElementById('markets-scanned');

let cards = {};

function initGrid() {
    gridContainer.innerHTML = '';
    marketsScannedElement.textContent = `0 / ${SYMBOLS.length}`;
    SYMBOLS.forEach(symbol => {
        const card = document.createElement('div');
        card.className = 'market-card';
        card.id = `card-${symbol}`;
        
        const type = 'STOCK';

        card.innerHTML = `
            <div class="card-header">
                <span class="symbol">${symbol}</span>
                <span class="asset-type">${type}</span>
            </div>
            <div class="card-body">
                <div class="price" id="price-${symbol}">---</div>
                <div class="change" id="change-${symbol}">---</div>
            </div>
        `;
        
        gridContainer.appendChild(card);
        
        card.addEventListener('click', () => openChartModal(symbol));

        cards[symbol] = {
            priceEl: card.querySelector(`#price-${symbol}`),
            changeEl: card.querySelector(`#change-${symbol}`),
            cardEl: card,
            lastPrice: 0
        };
    });
}

function updateClock() {
    const now = new Date();
    clockElement.textContent = now.toISOString().split('T')[1].split('.')[0] + ' UTC';
}

function addLog(message, type = 'info') {
    const time = new Date().toISOString().split('T')[1].split('.')[0];
    const logEl = document.createElement('div');
    logEl.className = 'log-entry';
    
    let content = `<span class="log-time">[${time}]</span> `;
    
    if (type === 'action') {
        content += `<span class="log-action">${message}</span>`;
    } else if (type === 'success') {
        content += `<span class="log-success">${message}</span>`;
    } else {
        content += `<span>${message}</span>`;
    }
    
    logEl.innerHTML = content;
    logContainer.prepend(logEl);
    
    if (logContainer.children.length > 50) {
        logContainer.lastChild.remove();
    }
}

function formatPrice(val) {
    const num = parseFloat(val);
    if (num < 1) return '$' + num.toFixed(4);
    if (num > 1000) return '$' + num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return '$' + num.toFixed(2);
}

function updateCard(symbol, price, change, changePercent) {
    const cardData = cards[symbol];
    if (!cardData) return;

    const currentPrice = parseFloat(price);
    const prevPrice = cardData.lastPrice;
    
    cardData.priceEl.textContent = formatPrice(price);
    
    const isUp = parseFloat(change) >= 0;
    const sign = isUp ? '+' : '';
    cardData.changeEl.textContent = `${sign}${parseFloat(change).toFixed(2)} (${sign}${parseFloat(changePercent).toFixed(2)}%)`;
    
    cardData.changeEl.className = `change ${isUp ? 'up' : 'down'}`;

    if (prevPrice !== 0 && prevPrice !== currentPrice) {
        cardData.cardEl.classList.remove('update-up', 'update-down');
        void cardData.cardEl.offsetWidth;
        if (currentPrice > prevPrice) {
            cardData.cardEl.classList.add('update-up');
        } else {
            cardData.cardEl.classList.add('update-down');
        }
    }

    cardData.lastPrice = currentPrice;
}

// Chart Modal Logic
const chartModal = document.getElementById('chart-modal');
const modalClose = document.getElementById('modal-close');
const modalTitle = document.getElementById('modal-title');
const modalLoading = document.getElementById('modal-loading');
const ctx = document.getElementById('quadrantChart').getContext('2d');
let quadrantChartInstance = null;

modalClose.addEventListener('click', () => {
    chartModal.classList.add('hidden');
});

chartModal.addEventListener('click', (e) => {
    if (e.target === chartModal) {
        chartModal.classList.add('hidden');
    }
});

async function openChartModal(symbol) {
    chartModal.classList.remove('hidden');
    modalTitle.textContent = `${symbol} - Price/Volume Analysis`;
    modalLoading.classList.remove('hidden');
    
    if (quadrantChartInstance) {
        quadrantChartInstance.destroy();
    }

    try {
        const fullData = await fetchBotData();
        const data = fullData.history[symbol];
        if (!data) throw new Error("No data found for this symbol");

        const labels = data.map(pt => pt.date);
        const closeData = data.map(pt => pt.close);
        const fi13Data = data.map(pt => pt.fi13);

        const fiColors = fi13Data.map(val => val >= 0 ? 'rgba(0, 255, 136, 0.8)' : 'rgba(255, 51, 102, 0.8)');

        quadrantChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Price',
                        type: 'line',
                        data: closeData,
                        borderColor: '#58a6ff',
                        backgroundColor: '#58a6ff',
                        yAxisID: 'y',
                        tension: 0.1,
                        pointRadius: 0,
                        borderWidth: 2
                    },
                    {
                        label: 'Force Index (13 EMA)',
                        type: 'bar',
                        data: fi13Data,
                        backgroundColor: fiColors,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        labels: { color: '#8b949e' }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    if (context.dataset.yAxisID === 'y1') {
                                        label += (context.parsed.y / 1000000).toFixed(2) + 'M';
                                    } else {
                                        label += '$' + context.parsed.y.toFixed(2);
                                    }
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#8b949e', maxTicksLimit: 10 },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Price ($)', color: '#8b949e' },
                        ticks: { color: '#8b949e' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Force Index', color: '#8b949e' },
                        ticks: { 
                            color: '#8b949e',
                            callback: (value) => (value / 1000000).toFixed(0) + 'M'
                        },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error fetching history:", error);
        addLog(`Failed to load history for ${symbol}`, 'action');
    } finally {
        modalLoading.classList.add('hidden');
    }
}

async function fetchMarketData() {
    try {
        const parsed = await fetchBotData();
        
        if (parsed && parsed.quotes) {
            const results = parsed.quotes;
            results.forEach(quote => {
                updateCard(
                    quote.symbol,
                    quote.regularMarketPrice,
                    quote.regularMarketChange,
                    quote.regularMarketChangePercent
                );
            });
            const updateTime = new Date(parsed.updatedAt);
            lastUpdateElement.textContent = updateTime.toISOString().split('T')[0] + ' ' + updateTime.toISOString().split('T')[1].split('.')[0] + ' UTC';
            marketsScannedElement.textContent = `${results.length} / ${SYMBOLS.length}`;
            addLog(`Loaded ${results.length} markets from static daily data`, 'info');
        } else {
            throw new Error("Invalid response format");
        }
    } catch (error) {
        console.error("Fetch error:", error);
        addLog("API Error. Failed to fetch market data.", "action");
    }
}

initGrid();
setInterval(updateClock, 1000);
updateClock();

addLog("SYSTEM INITIALIZED. GEMINI FORCEINDEX ONLINE.");
addLog("Establishing connection to static market data...", "info");

let botDataCache = null;

fetchMarketData();

async function fetchBotData() {
    if (botDataCache) return botDataCache;
    const response = await fetch('./force_index_data.json');
    if (!response.ok) throw new Error("Failed to load local data");
    botDataCache = await response.json();
    return botDataCache;
}
