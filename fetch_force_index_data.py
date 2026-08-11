import requests
import pandas as pd
import json
import re
import concurrent.futures

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

def get_symbols():
    try:
        with open('force_index.js', 'r') as f:
            text = f.read()
        match = re.search(r'const SYMBOLS = \[(.*?)\];', text, re.DOTALL)
        if not match:
            return []
        symbols = match.group(1).replace('\'', '').replace('"', '').replace('\n', '').replace(' ', '').split(',')
        return [s for s in symbols if s]
    except Exception as e:
        print(f"Error reading symbols: {e}")
        return []

def fetch_spark_batch(symbols_batch):
    url = f"https://query1.finance.yahoo.com/v7/finance/spark?symbols={symbols_batch}"
    headers = {'User-Agent': USER_AGENT}
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"Error fetching batch {symbols_batch}: {e}")
    return None

def fetch_history(symbol):
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=3mo"
        headers = {'User-Agent': USER_AGENT}
        r = requests.get(url, headers=headers, timeout=10)
        
        if r.status_code != 200:
            return symbol, None
            
        data = r.json()
        result = data.get('chart', {}).get('result', [])
        if not result:
            return symbol, None
            
        timestamps = result[0].get('timestamp', [])
        indicators = result[0].get('indicators', {}).get('quote', [{}])[0]
        
        closes = indicators.get('close', [])
        volumes = indicators.get('volume', [])
        
        if not closes or not volumes:
            return symbol, None
            
        df = pd.DataFrame({
            'Timestamp': timestamps,
            'Close': closes,
            'Volume': volumes
        })
        
        df = df.dropna()
        df['Date'] = pd.to_datetime(df['Timestamp'], unit='s')
        
        df['PrevClose'] = df['Close'].shift(1)
        df['FI1'] = (df['Close'] - df['PrevClose']) * df['Volume']
        df['FI2'] = df['FI1'].ewm(span=2, adjust=False).mean()
        df['FI13'] = df['FI1'].ewm(span=13, adjust=False).mean()
        
        data_points = []
        for index, row in df.iterrows():
            if pd.isna(row['FI13']):
                continue
                
            data_points.append({
                "date": row['Date'].strftime('%Y-%m-%d'),
                "close": row['Close'],
                "volume": int(row['Volume']),
                "fi1": row['FI1'],
                "fi2": row['FI2'],
                "fi13": row['FI13']
            })
            
        return symbol, data_points
    except Exception as e:
        print(f"Error fetching history for {symbol}: {e}")
        return symbol, None

def main():
    symbols_list = get_symbols()
    print(f"Loaded {len(symbols_list)} symbols")
    
    # 1. Fetch Quotes
    chunk_size = 20
    chunks = [",".join(symbols_list[i:i + chunk_size]) for i in range(0, len(symbols_list), chunk_size)]
    
    quotes_results = []
    
    print("Fetching quotes...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_chunk = {executor.submit(fetch_spark_batch, chunk): chunk for chunk in chunks}
        
        for future in concurrent.futures.as_completed(future_to_chunk):
            data = future.result()
            if data:
                for item in data.get('spark', {}).get('result', []):
                    try:
                        sym = item['symbol']
                        meta = item['response'][0]['meta']
                        current_price = meta.get('regularMarketPrice')
                        prev_close = meta.get('previousClose')
                        
                        if current_price is None or prev_close is None:
                            continue
                            
                        change = current_price - prev_close
                        change_percent = (change / prev_close) * 100 if prev_close != 0 else 0
                        
                        quotes_results.append({
                            "symbol": sym,
                            "regularMarketPrice": current_price,
                            "regularMarketChange": change,
                            "regularMarketChangePercent": change_percent
                        })
                    except Exception as e:
                        continue
                        
    # 2. Fetch History
    print("Fetching history...")
    history_results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_sym = {executor.submit(fetch_history, sym): sym for sym in symbols_list}
        
        for future in concurrent.futures.as_completed(future_to_sym):
            sym, data = future.result()
            if data:
                history_results[sym] = data
                
    # 3. Save JSON
    final_data = {
        "quotes": quotes_results,
        "history": history_results,
        "updatedAt": pd.Timestamp.now(tz='UTC').isoformat()
    }
    
    with open('force_index_data.json', 'w') as f:
        json.dump(final_data, f)
        
    print(f"Saved {len(quotes_results)} quotes and {len(history_results)} histories to force_index_data.json")

if __name__ == '__main__':
    main()
