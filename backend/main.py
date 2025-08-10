from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
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
    prices: List[float]
    market: str
    commodity: str
    dates: List[str]

class PricePredictionResponse(BaseModel):
    prediction: str
    confidence: str
    tip: str
    raw_response: str

# Sample data (same as frontend)
SAMPLE_DATA = {
    "markets": ["Merkato", "Shola", "Bole"],
    "data": {
        "Merkato": {
            "onion": [25, 27, 26, 28, 30, 29, 31],
            "teff": [120, 118, 119, 121, 122, 122, 123]
        },
        "Shola": {
            "onion": [24, 25, 25, 26, 26, 27, 28]
        },
        "Bole": {
            "onion": [26, 26, 27, 27, 28, 28, 29]
        }
    },
    "dates": [
        "2025-07-24",
        "2025-07-25", 
        "2025-07-26",
        "2025-07-27",
        "2025-07-28",
        "2025-07-29",
        "2025-07-30"
    ]
}

def build_gemini_prompt(prices: List[float], market: str, commodity: str, dates: List[str]) -> str:
    """Build a detailed prompt for Gemini AI price prediction"""
    return f"""You are MarketScan AI, an expert market analyst for Ethiopian agricultural markets.

CONTEXT:
- Market: {market}
- Commodity: {commodity}
- Price data: {prices} (for dates {dates})
- Latest price: {prices[-1]} ETB
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

def parse_gemini_response(response_text: str) -> dict:
    """Parse Gemini's response into structured data"""
    try:
        # Split by the format markers
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
    """Get available markets"""
    return {"markets": SAMPLE_DATA["markets"]}

@app.get("/commodities/{market}")
async def get_commodities(market: str):
    """Get available commodities for a market"""
    if market not in SAMPLE_DATA["data"]:
        raise HTTPException(status_code=404, detail="Market not found")
    
    commodities = list(SAMPLE_DATA["data"][market].keys())
    return {"commodities": commodities}

@app.get("/prices/{market}/{commodity}")
async def get_prices(market: str, commodity: str):
    """Get price data for a market and commodity"""
    if market not in SAMPLE_DATA["data"]:
        raise HTTPException(status_code=404, detail="Market not found")
    
    if commodity not in SAMPLE_DATA["data"][market]:
        raise HTTPException(status_code=404, detail="Commodity not found")
    
    prices = SAMPLE_DATA["data"][market][commodity]
    return {
        "market": market,
        "commodity": commodity,
        "prices": prices,
        "dates": SAMPLE_DATA["dates"],
        "latest_price": prices[-1],
        "change_percent": ((prices[-1] - prices[0]) / prices[0]) * 100 if prices[0] != 0 else 0
    }

@app.post("/predict", response_model=PricePredictionResponse)
async def predict_price(request: PricePredictionRequest):
    """Get AI prediction for price movement"""
    
    if not model:
        # Fallback response if Gemini is not configured
        return PricePredictionResponse(
            prediction="Gemini AI not configured - using fallback prediction",
            confidence="60%",
            tip="Configure GEMINI_API_KEY for real predictions",
            raw_response="Fallback response"
        )
    
    try:
        # Build the prompt
        prompt = build_gemini_prompt(
            request.prices,
            request.market,
            request.commodity,
            request.dates
        )
        
        # Get response from Gemini
        response = model.generate_content(prompt)
        response_text = response.text
        
        # Parse the response
        parsed = parse_gemini_response(response_text)
        
        return PricePredictionResponse(
            prediction=parsed["prediction"],
            confidence=parsed["confidence"],
            tip=parsed["tip"],
            raw_response=parsed["raw_response"]
        )
        
    except Exception as e:
        # Fallback response on error
        return PricePredictionResponse(
            prediction="Error occurred while generating prediction",
            confidence="50%",
            tip="Try again later or check market manually",
            raw_response=f"Error: {str(e)}"
        )

@app.get("/sample-data")
async def get_sample_data():
    """Get all sample data"""
    return SAMPLE_DATA

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
    
