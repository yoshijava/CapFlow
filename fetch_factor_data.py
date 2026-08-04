#!/usr/bin/env python3
import json
import time
import os
import sys
import yfinance as yf
import pandas as pd
import numpy as np

# Target Stocks to Analyze
STOCKS = {
    "GOOG": {"name": "Alphabet Inc. (Google)", "sector": "Technology / Comm", "flag": "🇺🇸"},
    "AAPL": {"name": "Apple Inc.", "sector": "Consumer Tech", "flag": "🇺🇸"},
    "NVDA": {"name": "NVIDIA Corporation", "sector": "Semiconductor / AI", "flag": "🇺🇸"},
    "AMD":  {"name": "Advanced Micro Devices", "sector": "Semiconductor / AI", "flag": "🇺🇸"},
    "TSM":  {"name": "Taiwan Semiconductor (TSMC)", "sector": "Semiconductor", "flag": "🇹🇼"}
}

# Impact Factors (Market, Macro & Commodities)
FACTORS = {
    "SPY":    {"name": "S&P 500 大盤 (SPY)", "category": "Market", "desc": "美股大盤大方向連動性"},
    "QQQ":    {"name": "納斯達克 100 (QQQ)", "category": "Market", "desc": "科技板塊整體走勢"},
    "^VIX":   {"name": "VIX 恐慌指數 (VIX)", "category": "Market", "desc": "市場波動度與恐慌情緒"},
    "^TNX":   {"name": "美債 10年期殖利率 (10Y Yield)", "category": "Macro", "desc": "無風險利率與估值無形壓力"},
    "UUP":    {"name": "美元指數 ETF (UUP)", "category": "Macro", "desc": "強勢美元對跨國企業營收影響"},
    "CL=F":   {"name": "輕原油期貨 (WTI Crude)", "category": "Macro", "desc": "能源通脹壓力因子"},
    "XLK":    {"name": "科技板塊 ETF (XLK)", "category": "Sector", "desc": "同業產業輪動連動性"}
}

ALL_SYMBOLS = list(STOCKS.keys()) + list(FACTORS.keys())

def compute_rolling_corr(s1, s2, window=60):
    """Compute rolling Pearson correlation between two pandas Series."""
    return s1.rolling(window=window).corr(s2).fillna(0)

def main():
    print("Fetching stock & factor dataset from Yahoo Finance using yfinance...")
    
    # Download 1 year of daily historical data for all symbols
    df_raw = yf.download(ALL_SYMBOLS, period="1y", interval="1d", group_by="ticker", auto_adjust=False)
    
    close_dict = {}
    for sym in ALL_SYMBOLS:
        try:
            if sym in df_raw.columns.levels[0]:
                ser = df_raw[sym]["Close"].dropna()
                close_dict[sym] = ser
        except Exception as e:
            print(f"Warning: could not process {sym}: {e}", file=sys.stderr)
            
    df_close = pd.DataFrame(close_dict).dropna()
    print(f"Data aligned across {len(df_close)} trading days for {len(df_close.columns)} symbols.")
    
    # Calculate Daily Percentage Returns (%)
    df_returns = df_close.pct_change().dropna()
    dates_list = df_returns.index.strftime('%Y-%m-%d').tolist()
    
    analytics_output = {
        "metadata": {
            "updated_at": time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime()),
            "dates": dates_list,
            "stocks": STOCKS,
            "factors": FACTORS
        },
        "stock_analysis": {}
    }
    
    factor_keys = list(FACTORS.keys())
    
    for stock_symbol in STOCKS.keys():
        if stock_symbol not in df_returns.columns:
            continue
            
        stock_ret = df_returns[stock_symbol]
        
        # 1. Pairwise Correlation & Factor Beta
        pearson_corrs = {}
        betas = {}
        
        for factor_sym in factor_keys:
            if factor_sym not in df_returns.columns:
                continue
            fac_ret = df_returns[factor_sym]
            
            p_corr = float(stock_ret.corr(fac_ret))
            
            # Regression Beta = Cov(stock, factor) / Var(factor)
            cov = float(np.cov(stock_ret, fac_ret)[0][1])
            var = float(np.var(fac_ret))
            beta = cov / var if var > 1e-8 else 0.0
            
            pearson_corrs[factor_sym] = round(p_corr, 3)
            betas[factor_sym] = round(beta, 3)
            
        # 2. Rolling 60-Day Correlation Timelines
        rolling_corrs = {}
        for factor_sym in factor_keys:
            if factor_sym not in df_returns.columns:
                continue
            fac_ret = df_returns[factor_sym]
            roll_ser = compute_rolling_corr(stock_ret, fac_ret, window=60)
            rolling_corrs[factor_sym] = [round(float(v), 3) for v in roll_ser.values]
            
        # 3. Inter-Factor Correlation Matrix for Heatmap (Stock + Factors)
        matrix_symbols = [stock_symbol] + [f for f in factor_keys if f in df_returns.columns]
        sub_df = df_returns[matrix_symbols]
        corr_matrix = sub_df.corr().round(3).values.tolist()
        
        # 4. Stock Price and Return History
        price_hist = [round(float(v), 2) for v in df_close[stock_symbol].iloc[1:].values]
        return_hist = [round(float(v) * 100, 2) for v in stock_ret.values]
        
        analytics_output["stock_analysis"][stock_symbol] = {
            "pearson_correlations": pearson_corrs,
            "factor_betas": betas,
            "rolling_correlations_60d": rolling_corrs,
            "matrix_symbols": matrix_symbols,
            "correlation_matrix": corr_matrix,
            "price_history": price_hist,
            "return_history": return_hist
        }
        
    out_path = os.path.join(os.path.dirname(__file__), "factor_data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(analytics_output, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully generated factor analytics dataset at {out_path}")

if __name__ == "__main__":
    main()
