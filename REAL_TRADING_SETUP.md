# 🚀 Real Trading Integration Guide

This guide explains how to connect your AI Trading Brain to a real broker for live trading.

## ⚠️ Important Disclaimer
- This is an automated trading system. Use with caution.
- Start with small amounts and paper trading first.
- Trading involves risk. You are responsible for all losses.
- Not financial advice. Educational purposes only.

---

## 🏦 Supported Brokers

### 1. **Zerodha** (Recommended for India - NSE/BSE)
**Best for:** NSE stocks, very low fees, ~500K users

#### Setup Steps:
```bash
# 1. Create Zerodha account at https://zerodha.com
# 2. Generate API key from https://kite.zerodha.com/account/apikeys
# 3. Install kite-connect SDK
pip install kiteconnect

# 4. Add credentials to backend/.env
ZERODHA_API_KEY=your_api_key_here
ZERODHA_API_SECRET=your_api_secret_here
ZERODHA_ACCESS_TOKEN=your_token_here  # get from Kite login
```

#### Integration Code Example:
```python
# File: backend/zerodha_broker.py
from kiteconnect import KiteConnect

class ZerodhaBroker:
    def __init__(self):
        self.kite = KiteConnect(api_key=os.getenv("ZERODHA_API_KEY"))
        self.kite.set_access_token(os.getenv("ZERODHA_ACCESS_TOKEN"))
    
    def place_order(self, symbol, quantity, price, transaction_type="BUY"):
        """
        Place order via Zerodha Kite API
        symbol: "INFY" (NSE symbol)
        quantity: 1
        price: 1500
        transaction_type: "BUY" or "SELL"
        """
        try:
            order = self.kite.place_order(
                variety="regular",
                exchange="NSE",
                tradingsymbol=symbol,
                transaction_type=transaction_type,
                quantity=quantity,
                price=price,
                order_type="LIMIT",
                product="MIS"  # Intraday
            )
            return {"status": "success", "order_id": order}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def get_balance(self):
        """Get account balance and available margin"""
        margin = self.kite.margins()
        return {
            "available_cash": margin["equity"]["available"],
            "total_balance": margin["equity"]["net"],
        }
    
    def get_positions(self):
        """Get open positions"""
        positions = self.kite.positions()
        return {
            "day": positions.get("day", []),
            "net": positions.get("net", []),
        }
    
    def cancel_order(self, order_id):
        """Cancel an order"""
        try:
            self.kite.cancel_order(variety="regular", order_id=order_id)
            return {"status": "success"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
```

### 2. **Interactive Brokers** (Global - Stocks, Forex, Crypto)
**Best for:** International traders, multiple asset classes

```bash
pip install ibapi

# Download TWS (Trader Workstation) from Interactive Brokers
# Enable API access: File → Global Configuration → API → Settings
# Enable "Enable ActiveX and Socket Clients"
```

### 3. **Alpaca** (Commission-free US stocks)
**Best for:** US stock traders, simple API

```bash
pip install alpaca-trade-api

# Get API keys from https://app.alpaca.markets/
# Add to .env:
ALPACA_API_KEY=your_key
ALPACA_API_SECRET=your_secret
ALPACA_BASE_URL=https://paper-trading.alpaca.markets  # Paper trading
```

### 4. **Broker with WebSocket** (Real-time updates)
```bash
pip install websocket-client
```

---

## 🔌 Integration into AutoTrader

### 1. Modify `backend/auto_trader.py`:

```python
# Add at top
from zerodha_broker import ZerodhaBroker

class AutoTrader:
    def __init__(self, config):
        self.config = config
        self.broker = ZerodhaBroker()  # Initialize broker
        self.test_mode = config.get("test_mode", True)  # Start in test mode
    
    async def execute_entry(self, signal):
        """Execute a BUY entry signal"""
        if self.test_mode:
            # Simulate trade in test mode
            return self._simulate_entry(signal)
        
        try:
            # Real trade
            result = self.broker.place_order(
                symbol=signal["symbol"],
                quantity=signal["shares_to_buy"],
                price=signal["entry_price"],
                transaction_type="BUY"
            )
            
            if result["status"] == "success":
                # Log real trade
                return {"status": "success", "order_id": result["order_id"]}
        except Exception as e:
            logger.error(f"Trade execution error: {e}")
            return {"status": "error", "message": str(e)}
    
    async def execute_exit(self, position):
        """Execute a SELL exit"""
        if self.test_mode:
            return self._simulate_exit(position)
        
        try:
            result = self.broker.place_order(
                symbol=position["symbol"],
                quantity=position["shares"],
                price=position["current_price"],
                transaction_type="SELL"
            )
            return result
        except Exception as e:
            return {"status": "error", "message": str(e)}
```

### 2. Add API Endpoints in `backend/main.py`:

```python
@app.post("/api/auto-trader/toggle-real-trading")
async def toggle_real_trading(enable: bool):
    """Switch between test mode and real trading"""
    global auto_trader
    if auto_trader:
        auto_trader.test_mode = not enable
        return {
            "status": "success",
            "test_mode": auto_trader.test_mode,
            "message": "Real trading disabled" if auto_trader.test_mode else "⚠️ REAL TRADING ENABLED"
        }
    return {"status": "error"}

@app.get("/api/account/balance")
async def get_account_balance():
    """Get real account balance from broker"""
    if not auto_trader or auto_trader.test_mode:
        return {"balance": auto_trader.capital, "mode": "test"}
    
    try:
        balance = auto_trader.broker.get_balance()
        return {"balance": balance, "mode": "live"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/account/positions")
async def get_account_positions():
    """Get real open positions from broker"""
    if not auto_trader or auto_trader.test_mode:
        return auto_trader.get_portfolio_value()
    
    try:
        positions = auto_trader.broker.get_positions()
        return positions
    except Exception as e:
        return {"status": "error", "message": str(e)}
```

### 3. Update Frontend to Show Real Trading Status

In `frontend/src/components/AutoTraderDashboard.tsx`:

```tsx
const [realTradingEnabled, setRealTradingEnabled] = useState(false);

const toggleRealTrading = async (enable: boolean) => {
  if (enable) {
    // Warn user
    const confirmed = window.confirm(
      "⚠️ ENABLE REAL TRADING?\n\nThis will place actual trades with REAL MONEY.\nClick OK only if you are sure."
    );
    if (!confirmed) return;
  }
  
  try {
    const res = await fetch("http://localhost:8000/api/auto-trader/toggle-real-trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enable }),
    });
    const data = await res.json();
    setRealTradingEnabled(!data.test_mode);
  } catch (error) {
    console.error("Failed to toggle real trading:", error);
  }
};

// In render:
<div className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 ${
  realTradingEnabled 
    ? "bg-red/20 text-red border border-red/50" 
    : "bg-green/20 text-green border border-green/50"
}`}>
  <span className={`w-3 h-3 rounded-full ${realTradingEnabled ? "bg-red animate-pulse" : "bg-green"}`} />
  {realTradingEnabled ? "🔴 LIVE TRADING" : "🟢 TEST MODE"}
</div>
```

---

## 🔐 Security Best Practices

### 1. **API Key Management**
```bash
# .env file (NEVER commit this)
ZERODHA_API_KEY=xxx
ZERODHA_API_SECRET=xxx
ZERODHA_ACCESS_TOKEN=xxx

# Add to .gitignore
*.env
.env
.env.local
```

### 2. **Rate Limiting**
```python
from slowapi import Limiter

limiter = Limiter(key_func=get_remote_address)

@app.post("/api/auto-trader/execute-trade")
@limiter.limit("10/minute")
async def execute_trade(request: Request):
    """Only allow 10 trades per minute max"""
    pass
```

### 3. **Order Validation**
```python
def validate_order(order):
    """Validate order before sending to broker"""
    max_quantity = 100  # Max shares per trade
    min_price = 1       # Min price
    
    if order["quantity"] > max_quantity:
        raise ValueError(f"Quantity {order['quantity']} exceeds max {max_quantity}")
    if order["price"] < min_price:
        raise ValueError(f"Price {order['price']} below minimum {min_price}")
    
    return True
```

---

## 📊 Testing Real Trading

### Step 1: Start with Paper Trading
```python
# In auto_trader.py
self.test_mode = True  # Always start here!
```

### Step 2: Monitor for 1-2 weeks
- Watch signal quality
- Check if account grows
- Verify entry/exit logic

### Step 3: Enable Real Trading Gradually
```bash
# Start with 10% of capital
INITIAL_CAPITAL=100000
REAL_CAPITAL=10000  # 10% only

# Only move to 100% after 1 month+ of consistent gains
```

---

## 🐛 Troubleshooting

### Order Not Placing
```python
# Check:
1. API key valid? → Zerodha console
2. Market hours? → 9:15 - 15:30 IST for NSE
3. Sufficient balance? → broker.get_balance()
4. Correct symbol? → Use "INFY" not "INFY.NS"
```

### Positions Not Showing
```python
# Common issues:
- Access token expired → Re-login to Kite
- Wrong exchange → NSE vs BSE vs NFO
- T+2 settlement → Positions show after 2 days
```

---

## 📈 Next Steps

1. ✅ **Choose a broker** (Zerodha recommended)
2. ✅ **Get API credentials** from broker
3. ✅ **Implement broker connection** in backend
4. ✅ **Test in paper/simulation mode** for 2 weeks
5. ✅ **Enable real trading** with small amount
6. ✅ **Monitor daily P&L** closely
7. ✅ **Scale up** after consistent profits

---

## 🎯 Real Trading Checklist

- [ ] Broker account created
- [ ] API keys generated and secured
- [ ] Backend broker integration implemented
- [ ] Auto-trader connected to real broker
- [ ] Paper trading tested (2 weeks)
- [ ] Real trading toggle added to UI
- [ ] Risk management rules set
- [ ] Daily monitoring set up
- [ ] Profit/Loss tracking enabled
- [ ] Emergency stop-loss procedures tested

---

**Start small. Grow fast. Trade smart.** 🚀
