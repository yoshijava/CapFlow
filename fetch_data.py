#!/usr/bin/env python3
import json
import time
import os
import sys
import yfinance as yf
import pandas as pd

TICKERS_SECTORS = {
    "XLK": {"name": "科技板塊 (Technology)", "category": "Sector", "color": "#00f0ff"},
    "XLF": {"name": "金融板塊 (Financials)", "category": "Sector", "color": "#3b82f6"},
    "XLE": {"name": "能源板塊 (Energy)", "category": "Sector", "color": "#f59e0b"},
    "XLV": {"name": "醫療保健 (Healthcare)", "category": "Sector", "color": "#10b981"},
    "XLY": {"name": "非必需消費 (Consumer Disc.)", "category": "Sector", "color": "#ec4899"},
    "XLP": {"name": "必需消費 (Consumer Staples)", "category": "Sector", "color": "#8b5cf6"},
    "XLI": {"name": "工業板塊 (Industrials)", "category": "Sector", "color": "#6366f1"},
    "XLC": {"name": "通訊服務 (Comm. Services)", "category": "Sector", "color": "#06b6d4"},
    "XLB": {"name": "基礎材料 (Materials)", "category": "Sector", "color": "#14b8a6"},
    "XLU": {"name": "公用事業 (Utilities)", "category": "Sector", "color": "#84cc16"},
    "XLRE": {"name": "房地產 (Real Estate)", "category": "Sector", "color": "#f43f5e"},
    "SMH": {"name": "半導體產業 (Semiconductors)", "category": "Sector", "color": "#a855f7"},
}

TICKERS_COUNTRIES = {
    "SPY": {"name": "美國 (USA / S&P500)", "category": "Country", "flag": "🇺🇸", "color": "#3b82f6"},
    "EWJ": {"name": "日本 (Japan / MSCI)", "category": "Country", "flag": "🇯🇵", "color": "#ef4444"},
    "EWG": {"name": "德國 (Germany / DAX)", "category": "Country", "flag": "🇩🇪", "color": "#eab308"},
    "FXI": {"name": "中國 (China / Large Cap)", "category": "Country", "flag": "🇨🇳", "color": "#dc2626"},
    "EWT": {"name": "台灣 (Taiwan / MSCI)", "category": "Country", "flag": "🇹🇼", "color": "#06b6d4"},
    "INDA": {"name": "印度 (India / MSCI)", "category": "Country", "flag": "🇮🇳", "color": "#f97316"},
    "EWU": {"name": "英國 (United Kingdom)", "category": "Country", "flag": "🇬🇧", "color": "#8b5cf6"},
    "EWA": {"name": "澳洲 (Australia)", "category": "Country", "flag": "🇦🇺", "color": "#10b981"},
    "EWC": {"name": "加拿大 (Canada)", "category": "Country", "flag": "🇨🇦", "color": "#ec4899"},
    "EWZ": {"name": "巴西 (Brazil)", "category": "Country", "flag": "🇧🇷", "color": "#22c55e"},
    "EEM": {"name": "新興市場 (Emerging Markets)", "category": "Country", "flag": "🌐", "color": "#a855f7"},
}

ALL_TICKERS = {**TICKERS_SECTORS, **TICKERS_COUNTRIES}

def main():
    print("Fetching data from Yahoo Finance using yfinance...")
    symbols = list(ALL_TICKERS.keys())
    
    # Download 6 months of daily data for all tickers at once
    df_raw = yf.download(symbols, period="6mo", interval="1d", group_by="ticker", auto_adjust=False)
    
    ticker_series = {}
    all_dates = set()
    
    for symbol in symbols:
        try:
            if len(symbols) == 1:
                df_sym = df_raw.copy()
            else:
                if symbol not in df_raw.columns.levels[0]:
                    print(f"Warning: {symbol} not found in download results", file=sys.stderr)
                    continue
                df_sym = df_raw[symbol].copy()
                
            df_sym = df_sym.dropna(subset=["Close", "Open", "High", "Low"])
            if df_sym.empty:
                continue
                
            records = []
            for idx, row in df_sym.iterrows():
                dt_str = idx.strftime('%Y-%m-%d')
                op = float(row["Open"])
                hi = float(row["High"])
                lo = float(row["Low"])
                cl = float(row["Close"])
                vol = float(row["Volume"]) if "Volume" in row and not pd.isna(row["Volume"]) else 1.0
                
                dollar_vol = cl * vol
                hl_range = max(hi - lo, 1e-4)
                flow_ratio = (cl - op) / hl_range
                net_flow = flow_ratio * dollar_vol
                
                records.append({
                    "date": dt_str,
                    "open": round(op, 2),
                    "high": round(hi, 2),
                    "low": round(lo, 2),
                    "close": round(cl, 2),
                    "volume": round(vol, 0),
                    "dollar_vol": round(dollar_vol, 0),
                    "net_flow": round(net_flow, 0)
                })
                all_dates.add(dt_str)
                
            ticker_series[symbol] = records
            print(f"  Processed {symbol}: {len(records)} days.")
        except Exception as e:
            print(f"Error processing {symbol}: {e}", file=sys.stderr)
            
    sorted_dates = sorted(list(all_dates))
    print(f"\nTotal Tickers: {len(ticker_series)} / Total Trading Days: {len(sorted_dates)}")
    
    output_data = {
        "metadata": {
            "updated_at": time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime()),
            "dates": sorted_dates,
            "tickers": ALL_TICKERS
        },
        "series": ticker_series
    }
    
    out_path = os.path.join(os.path.dirname(__file__), "data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully wrote data to {out_path}")

if __name__ == "__main__":
    main()
