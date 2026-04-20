"""
Zerodha Broker Integration — Real trading via Kite API
Handles order placement, position tracking, account balance
"""
import os
import logging
from typing import Dict, List, Optional
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ── Config from .env ────────────────────────────────────────────────────
REAL_TRADING_CAPITAL = float(os.getenv("REAL_TRADING_CAPITAL", "5000"))
MIN_BALANCE_LIMIT = float(os.getenv("MIN_BALANCE_LIMIT", "2000"))
PAPER_TRADING_CAPITAL = float(os.getenv("PAPER_TRADING_CAPITAL", "10000"))
STRATEGY_WIN_RATE_THRESHOLD = int(os.getenv("STRATEGY_WIN_RATE_THRESHOLD", "60"))
MIN_TRADES_FOR_SELECTION = int(os.getenv("MIN_TRADES_FOR_SELECTION", "10"))

# Zerodha Kite API wrapper
# Install: pip install kiteconnect
# Docs: https://kite.trade

class ZerodhaBroker:
    """
    Integration with Zerodha Kite API for real trading.

    Requires:
    - ZERODHA_API_KEY in .env
    - ZERODHA_API_SECRET in .env
    - ZERODHA_ACCESS_TOKEN in .env (get from Kite login)
    """

    def __init__(self):
        try:
            from kiteconnect import KiteConnect

            self.api_key = os.getenv("ZERODHA_API_KEY")
            self.api_secret = os.getenv("ZERODHA_API_SECRET")
            self.access_token = os.getenv("ZERODHA_ACCESS_TOKEN")

            if not all([self.api_key, self.api_secret, self.access_token]):
                raise ValueError("Missing Zerodha credentials in .env")

            self.kite = KiteConnect(api_key=self.api_key)
            self.kite.set_access_token(self.access_token)

            logger.info("✅ Zerodha Kite API connected")
            self.connected = True
        except ImportError:
            logger.warning("⚠️ kiteconnect not installed. Run: pip install kiteconnect")
            self.connected = False
        except Exception as e:
            logger.error(f"❌ Zerodha connection failed: {e}")
            self.connected = False

    def place_order(
        self,
        symbol: str,
        quantity: int,
        price: float,
        transaction_type: str = "BUY",
        order_type: str = "LIMIT"
    ) -> Dict:
        """
        Place an order via Zerodha.

        Args:
            symbol: NSE symbol (e.g., "INFY", "TCS")
            quantity: Number of shares
            price: Order price (in rupees)
            transaction_type: "BUY" or "SELL"
            order_type: "LIMIT" or "MARKET"

        Returns:
            {"status": "success", "order_id": "123456"}
            {"status": "error", "message": "..."}
        """
        if not self.connected:
            return {"status": "error", "message": "Broker not connected"}

        try:
            order_id = self.kite.place_order(
                variety="regular",
                exchange="NSE",
                tradingsymbol=symbol,
                transaction_type=transaction_type,
                quantity=quantity,
                price=price,
                order_type=order_type,
                product="MIS"  # Intraday (margin intraday square-off)
            )

            logger.info(f"📊 Order placed: {symbol} {transaction_type} {quantity} @ {price}")
            return {
                "status": "success",
                "order_id": order_id,
                "symbol": symbol,
                "quantity": quantity,
                "price": price,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"❌ Order placement failed: {e}")
            return {"status": "error", "message": str(e)}

    def cancel_order(self, order_id: str) -> Dict:
        """Cancel a pending order."""
        if not self.connected:
            return {"status": "error", "message": "Broker not connected"}

        try:
            self.kite.cancel_order(variety="regular", order_id=order_id)
            logger.info(f"🔄 Order cancelled: {order_id}")
            return {"status": "success", "order_id": order_id}
        except Exception as e:
            logger.error(f"❌ Cancel failed: {e}")
            return {"status": "error", "message": str(e)}

    def modify_order(
        self,
        order_id: str,
        quantity: Optional[int] = None,
        price: Optional[float] = None
    ) -> Dict:
        """Modify a pending order."""
        if not self.connected:
            return {"status": "error", "message": "Broker not connected"}

        try:
            params = {"variety": "regular", "order_id": order_id}
            if quantity:
                params["quantity"] = quantity
            if price:
                params["price"] = price

            self.kite.modify_order(**params)
            logger.info(f"✏️ Order modified: {order_id}")
            return {"status": "success", "order_id": order_id}
        except Exception as e:
            logger.error(f"❌ Modify failed: {e}")
            return {"status": "error", "message": str(e)}

    def get_balance(self) -> Dict:
        """Get account balance and margin info."""
        if not self.connected:
            return {"status": "error", "message": "Broker not connected"}

        try:
            margins = self.kite.margins()
            equity = margins.get("equity", {}) or {}
            # KiteConnect returns `available` and `utilised` as NESTED DICTS, not numbers.
            available = equity.get("available", {}) or {}
            utilised = equity.get("utilised", {}) or {}

            # Prefer live_balance (real-time cash available for trading); fall back to cash.
            cash_avail = available.get("live_balance")
            if cash_avail is None:
                cash_avail = available.get("cash", 0)

            return {
                "status": "success",
                "available_cash": round(float(cash_avail or 0), 2),
                "used_margin": round(float(utilised.get("debits", 0) or 0), 2),
                "total_balance": round(float(equity.get("net", 0) or 0), 2),
                "multiplier": equity.get("multiplier", 1),
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"❌ Balance fetch failed: {e}")
            return {"status": "error", "message": str(e)}

    def get_positions(self) -> Dict:
        """Get open positions (intraday)."""
        if not self.connected:
            return {"status": "error", "message": "Broker not connected"}

        try:
            positions = self.kite.positions()

            # Format day positions (intraday trades)
            day_positions = []
            for pos in positions.get("day", []):
                day_positions.append({
                    "symbol": pos["tradingsymbol"],
                    "quantity": pos["quantity"],
                    "buy_price": round(pos["average_price"], 2),
                    "current_price": round(pos["last_price"], 2),
                    "unrealized_pnl": round(pos["pnl"], 2),
                    "pnl_percent": round((pos["pnl"] / (pos["average_price"] * pos["quantity"])) * 100, 2) if pos["quantity"] > 0 else 0
                })

            return {
                "status": "success",
                "positions": day_positions,
                "total_positions": len(day_positions),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"❌ Position fetch failed: {e}")
            return {"status": "error", "message": str(e)}

    def get_orders(self, count: int = 10) -> Dict:
        """Get recent orders."""
        if not self.connected:
            return {"status": "error", "message": "Broker not connected"}

        try:
            orders = self.kite.orders()

            # Return last N orders with details
            recent = []
            for order in orders[-count:]:
                recent.append({
                    "order_id": order["order_id"],
                    "symbol": order["tradingsymbol"],
                    "quantity": order["quantity"],
                    "price": order["price"],
                    "status": order["status"],
                    "timestamp": order["order_timestamp"]
                })

            return {
                "status": "success",
                "orders": recent,
                "count": len(recent)
            }
        except Exception as e:
            logger.error(f"❌ Orders fetch failed: {e}")
            return {"status": "error", "message": str(e)}

    def get_trades(self, count: int = 10) -> Dict:
        """Get executed trades."""
        if not self.connected:
            return {"status": "error", "message": "Broker not connected"}

        try:
            trades = self.kite.trades()

            recent = []
            for trade in trades[-count:]:
                recent.append({
                    "order_id": trade["order_id"],
                    "symbol": trade["tradingsymbol"],
                    "quantity": trade["quantity"],
                    "price": trade["price"],
                    "exchange_timestamp": trade["exchange_timestamp"]
                })

            return {
                "status": "success",
                "trades": recent,
                "count": len(recent)
            }
        except Exception as e:
            logger.error(f"❌ Trades fetch failed: {e}")
            return {"status": "error", "message": str(e)}

    def get_quote(self, symbol: str) -> Dict:
        """Get live quote for a symbol."""
        if not self.connected:
            return {"status": "error", "message": "Broker not connected"}

        try:
            data = self.kite.quote(f"NSE:{symbol}")
            quote = data.get(f"NSE:{symbol}", {})

            return {
                "status": "success",
                "symbol": symbol,
                "price": quote.get("last_price", 0),
                "bid": quote.get("bid", 0),
                "ask": quote.get("ask", 0),
                "volume": quote.get("volume", 0),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"❌ Quote fetch failed: {e}")
            return {"status": "error", "message": str(e)}

    def place_bracket_order(
        self,
        symbol: str,
        quantity: int,
        entry_price: float,
        stop_loss: float,
        target: float,
        transaction_type: str = "BUY"
    ) -> Dict:
        """
        Place a bracket order (entry + stop loss + target).

        Useful for automatic risk management.
        """
        if not self.connected:
            return {"status": "error", "message": "Broker not connected"}

        try:
            # Calculate stop loss and profit quantities/prices
            sl_price = stop_loss if transaction_type == "BUY" else stop_loss
            target_price = target if transaction_type == "BUY" else target

            order_id = self.kite.place_order(
                variety="bracket",
                exchange="NSE",
                tradingsymbol=symbol,
                transaction_type=transaction_type,
                quantity=quantity,
                price=entry_price,
                order_type="LIMIT",
                squareoff=abs(target_price - entry_price),
                stoploss=abs(entry_price - sl_price),
                trailing_stoploss=0,
                product="MIS"
            )

            logger.info(f"🎯 Bracket order placed: {symbol} Entry:{entry_price} SL:{sl_price} Target:{target_price}")
            return {
                "status": "success",
                "order_id": order_id,
                "entry_price": entry_price,
                "stop_loss": sl_price,
                "target": target_price
            }
        except Exception as e:
            logger.error(f"❌ Bracket order failed: {e}")
            return {"status": "error", "message": str(e)}

    def get_margin_available(self) -> Dict:
        """Get available margin for trading."""
        balance = self.get_balance()
        if balance.get("status") == "success":
            return {
                "available": balance["available_cash"],
                "used": balance["used_margin"]
            }
        return {"available": 0, "used": 0}

    def can_trade(self) -> Dict:
        """Check if trading should continue based on balance limits."""
        balance = self.get_balance()
        if balance.get("status") != "success":
            return {"can_trade": False, "reason": "Cannot fetch balance"}

        current_balance = balance.get("total_balance", 0)

        if current_balance < MIN_BALANCE_LIMIT:
            return {
                "can_trade": False,
                "reason": f"Balance ₹{current_balance} below minimum ₹{MIN_BALANCE_LIMIT}",
                "current_balance": current_balance,
                "min_limit": MIN_BALANCE_LIMIT
            }

        return {
            "can_trade": True,
            "current_balance": current_balance,
            "min_limit": MIN_BALANCE_LIMIT,
            "capital_used_percent": ((REAL_TRADING_CAPITAL - current_balance) / REAL_TRADING_CAPITAL) * 100
        }


# Demo/Testing mode
class PaperTradingBroker:
    """
    Simulated broker for paper trading (testing without real money).
    """

    def __init__(self, initial_capital: float = 100000):
        self.capital = initial_capital
        self.positions: Dict[str, Dict] = {}
        self.order_id_counter = 1
        self.orders: List[Dict] = []
        self.trades: List[Dict] = []
        logger.info(f"📄 Paper trading mode initialized with ₹{initial_capital}")
        self.connected = True

    def place_order(self, symbol: str, quantity: int, price: float, transaction_type: str = "BUY", **kwargs) -> Dict:
        """Simulate order placement."""
        order_id = str(self.order_id_counter)
        self.order_id_counter += 1

        # Simulate immediate execution (for paper trading)
        if transaction_type == "BUY":
            cost = quantity * price
            if cost > self.capital:
                return {"status": "error", "message": "Insufficient capital"}
            self.capital -= cost
        else:
            if symbol not in self.positions:
                return {"status": "error", "message": "Position not found"}
            self.capital += quantity * price

        # Update positions
        if transaction_type == "BUY":
            if symbol in self.positions:
                self.positions[symbol]["quantity"] += quantity
            else:
                self.positions[symbol] = {"quantity": quantity, "avg_price": price}
        else:
            self.positions[symbol]["quantity"] -= quantity

        logger.info(f"📄 [PAPER] Order: {symbol} {transaction_type} {quantity} @ {price}")
        return {"status": "success", "order_id": order_id}

    def get_balance(self) -> Dict:
        """Get simulated balance."""
        return {
            "status": "success",
            "available_cash": round(self.capital, 2),
            "used_margin": 0,
            "total_balance": round(self.capital, 2)
        }

    def get_positions(self) -> Dict:
        """Get simulated positions."""
        positions = []
        for symbol, pos in self.positions.items():
            positions.append({
                "symbol": symbol,
                "quantity": pos["quantity"],
                "buy_price": pos["avg_price"],
                "current_price": pos["avg_price"],  # In paper trading, assume no movement
                "unrealized_pnl": 0
            })
        return {"status": "success", "positions": positions}
