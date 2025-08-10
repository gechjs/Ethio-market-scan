from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import google.generativeai as genai
import os
from dotenv import load_dotenv
import json

# Load environment variables from backend/.env explicitly
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path=ENV_PATH, override=True)

# Configure Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(GEMINI_MODEL)
else:
    model = None

# Load dataset from file
DATASET_PATH = os.path.join(BASE_DIR, "data", "dataset.json")
with open(DATASET_PATH, "r", encoding="utf-8") as f:
    DATASET: Dict[str, Any] = json.load(f)

app = FastAPI(
    title="MarketScan AI Backend",
    description="AI-powered market price prediction API",
    version="1.0.0"
)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class PricePredictionRequest(BaseModel):
    prices: Optional[List[float]] = None
    market: str
    commodity: str
    dates: Optional[List[str]] = None

class PricePredictionResponse(BaseModel):
    prediction: str
    confidence: str
    tip: str
    raw_response: str

# Helpers to get data from dataset
def get_available_markets() -> List[str]:
    return DATASET.get("markets", [])

def get_dates() -> List[str]:
    return DATASET.get("dates", [])

def get_prices_from_dataset(market: str, commodity: str) -> List[float]:
    data = DATASET.get("data", {})
    market_data = data.get(market)
    if not market_data:
        raise HTTPException(status_code=404, detail="Market not found")
    prices = market_data.get(commodity)
    if prices is None:
        raise HTTPException(status_code=404, detail="Commodity not found")
    return prices

# Build prompt
def build_gemini_prompt(prices: List[float], market: str, commodity: str, dates: List[str]) -> str:
    return f"""You are MarketScan AI, an expert market analyst for Ethiopian agricultural markets.

CONTEXT:
- Market: {market}
- Commodity: {commodity}
- Price data: {prices} (for dates {dates})
- Latest price: {prices[-1]} {DATASET.get('meta', {}).get('currency', 'ETB')}
- Price trend: {'↗' if prices[-1] > prices[0] else '↘' if prices[-1] < prices[0] else '→'}

TASK:
Analyze this price data and provide:
1. A 1-sentence prediction for tomorrow's price (will it go up, down, or stay stable?)
2. A confidence score (40-95%) based on the data patterns
3. A short actionable tip (max 10 words) for buyers/sellers

FORMAT YOUR RESPONSE EXACTLY AS:
Prediction: [your prediction sentence]
Confidence: [XX%]
Tip: [your tip]

EXAMPLES:
- If prices are rising: "Prediction: Price likely to increase by 2-3 ETB tomorrow. / Confidence: 75% / Tip: Buy today before prices rise further."
- If prices are stable: "Prediction: Price expected to remain stable around current level. / Confidence: 65% / Tip: Good time to buy, no rush needed."
- If prices are falling: "Prediction: Price may continue declining by 1-2 ETB. / Confidence: 70% / Tip: Wait 1-2 days for better prices."

Be realistic and consider Ethiopian market patterns, seasonal factors, and price volatility."""

# Parse response
def parse_gemini_response(response_text: str) -> dict:
    try:
        parts = response_text.split(" / ")
        prediction = ""
        confidence = ""
        tip = ""
        for part in parts:
            part = part.strip()
            if part.startswith("Prediction:"):
                prediction = part.replace("Prediction:", "").strip()
            elif part.startswith("Confidence:"):
                confidence = part.replace("Confidence:", "").strip()
            elif part.startswith("Tip:"):
                tip = part.replace("Tip:", "").strip()
        return {
            "prediction": prediction or "Price movement uncertain",
            "confidence": confidence or "60%",
            "tip": tip or "Monitor market conditions",
            "raw_response": response_text
        }
    except Exception:
        return {
            "prediction": "Unable to parse prediction",
            "confidence": "50%",
            "tip": "Check market manually",
            "raw_response": response_text
        }

@app.get("/")
async def root():
    return {
        "message": "MarketScan AI Backend",
        "version": "1.0.0",
        "status": "running",
        "gemini_configured": model is not None,
        "gemini_model": GEMINI_MODEL if model else None,
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "gemini_available": model is not None, "gemini_model": GEMINI_MODEL if model else None}

@app.get("/markets")
async def get_markets():
    return {"markets": get_available_markets(), "markets_meta": DATASET.get("markets_meta", {})}

@app.get("/commodities/{market}")
async def get_commodities(market: str):
    if market not in DATASET.get("data", {}):
        raise HTTPException(status_code=404, detail="Market not found")
    commodities = list(DATASET["data"][market].keys())
    return {"commodities": commodities, "items_meta": DATASET.get("items_meta", {})}

@app.get("/prices/{market}/{commodity}")
async def get_prices(market: str, commodity: str):
    prices = get_prices_from_dataset(market, commodity)
    dates = get_dates()
    return {
        "market": market,
        "commodity": commodity,
        "prices": prices,
        "dates": dates,
        "latest_price": prices[-1],
        "change_percent": ((prices[-1] - prices[0]) / prices[0]) * 100 if prices[0] != 0 else 0,
        "meta": DATASET.get("meta", {}),
        "market_meta": DATASET.get("markets_meta", {}).get(market, {}),
        "item_meta": DATASET.get("items_meta", {}).get(commodity, {})
    }

@app.get("/featured")
async def get_featured(limit: int = 6, city: str | None = None):
    featured = []
    markets = DATASET.get("markets", [])
    markets_meta = DATASET.get("markets_meta", {})
    for m in markets:
        if city and markets_meta.get(m, {}).get("city", "").lower() != city.lower():
            continue
        items = DATASET.get("data", {}).get(m, {})
        for item, prices in items.items():
            latest = prices[-1] if prices else None
            change = ((prices[-1] - prices[0]) / prices[0]) * 100 if prices and prices[0] != 0 else 0
            featured.append({
                "market": m,
                "commodity": item,
                "latest_price": latest,
                "change_percent": change,
                "market_meta": markets_meta.get(m, {}),
                "item_meta": DATASET.get("items_meta", {}).get(item, {}),
            })
    # sort by abs change desc
    featured.sort(key=lambda x: abs(x.get("change_percent", 0)), reverse=True)
    return {"items": featured[:limit], "meta": DATASET.get("meta", {})}

@app.post("/predict", response_model=PricePredictionResponse)
async def predict_price(request: PricePredictionRequest):
    # If prices not provided, read from dataset using market + commodity
    prices = request.prices
    dates = request.dates or get_dates()
    if not prices:
        prices = get_prices_from_dataset(request.market, request.commodity)
    
    if not model:
        return PricePredictionResponse(
            prediction="Gemini AI not configured - using fallback prediction",
            confidence="60%",
            tip="Configure GEMINI_API_KEY for real predictions",
            raw_response="Fallback response"
        )
    
    try:
        prompt = build_gemini_prompt(prices, request.market, request.commodity, dates)
        response = model.generate_content(prompt)
        response_text = response.text
        parsed = parse_gemini_response(response_text)
        return PricePredictionResponse(
            prediction=parsed["prediction"],
            confidence=parsed["confidence"],
            tip=parsed["tip"],
            raw_response=parsed["raw_response"]
        )
    except Exception as e:
        return PricePredictionResponse(
            prediction="Error occurred while generating prediction",
            confidence="50%",
            tip="Try again later or check market manually",
            raw_response=f"Error: {str(e)}"
        )

@app.get("/sample-data")
async def get_sample_data():
    return DATASET

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
    
