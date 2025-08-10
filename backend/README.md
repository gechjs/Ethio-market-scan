# MarketScan AI Backend

FastAPI backend with Gemini AI integration for market price predictions.

## Setup

1. **Install dependencies:**

```bash
pip install -r requirements.txt
```

2. **Set up environment variables:**
   Create a `.env` file in the backend directory:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your Gemini API key from: https://aistudio.google.com/app/apikey

3. **Run the server:**

```bash
python main.py
```

Or with uvicorn:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

- `GET /` - Health check and status
- `GET /health` - Health check
- `GET /markets` - Get available markets
- `GET /commodities/{market}` - Get commodities for a market
- `GET /prices/{market}/{commodity}` - Get price data
- `POST /predict` - Get AI prediction
- `GET /sample-data` - Get all sample data

## API Documentation

Once running, visit:

- http://localhost:8000/docs - Interactive API docs
- http://localhost:8000/redoc - Alternative API docs

## Frontend Integration

The backend is configured with CORS to work with the React frontend running on:

- http://localhost:5173
- http://localhost:5174
- http://localhost:5175
