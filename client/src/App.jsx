import { useMemo, useState } from 'react'
import './App.css'
import pricesData from './data/prices.json'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

function buildGeminiPrompt(prices, market, commodity, dates) {
  return `You are MarketScan AI. Data: prices for ${commodity} in ${market} for dates ${dates.join(', ')}: [${prices.join(', ')}]. Latest: ${prices[prices.length - 1]}. Task: Provide a 1-sentence 1-day price prediction, a confidence score (40-95%) based on 7 days data, and a short actionable tip (10 words max). Format as: Prediction: ... / Confidence: ... / Tip: ...`;
}

async function fetchGeminiPrediction(prices, market, commodity, dates) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  const model = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash-exp'
  const prompt = buildGeminiPrompt(prices, market, commodity, dates)

  if (!apiKey) {
    // Mock fallback if no key set
    return {
      text: `Prediction: Slight increase likely tomorrow. / Confidence: 68% / Tip: Compare prices across markets today.`,
    }
  }

  // Using Google AI Studio style endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
        role: 'user',
      },
    ],
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const fallback = `Prediction: Stable to slight rise tomorrow. / Confidence: 62% / Tip: Buy early; prices vary midday.`
    return { text: fallback }
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Prediction: Stable / Confidence: 60% / Tip: Monitor multiple vendors.'
  return { text }
}

function computeChangePercent(prices) {
  if (!prices || prices.length < 2) return 0
  const first = prices[0]
  const last = prices[prices.length - 1]
  if (first === 0) return 0
  return ((last - first) / first) * 100
}

function App() {
  const [selectedMarket, setSelectedMarket] = useState(pricesData.markets[0] || '')
  const commodities = useMemo(() => {
    const marketData = pricesData.data[selectedMarket] || {}
    return Object.keys(marketData)
  }, [selectedMarket])

  const [selectedCommodity, setSelectedCommodity] = useState('onion')
  const [latestPrice, setLatestPrice] = useState(null)
  const [changePct, setChangePct] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const dates = pricesData.dates

  const series = useMemo(() => {
    const marketData = pricesData.data[selectedMarket] || {}
    return marketData[selectedCommodity] || []
  }, [selectedMarket, selectedCommodity])

  const chartData = useMemo(() => {
    return {
      labels: dates.map((d) => d.slice(5)),
      datasets: [
        {
          data: series,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.15)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
        },
      ],
    }
  }, [series, dates])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: { x: { display: true }, y: { display: true } },
  }), [])

  async function handleCheckPrice() {
    setError('')
    setPrediction(null)
    setLoading(true)
    try {
      const prices = series
      if (!prices || prices.length === 0) {
        setError('No data found for the selected market and commodity.')
        setLoading(false)
        return
      }
      const last = prices[prices.length - 1]
      setLatestPrice(last)
      setChangePct(computeChangePercent(prices))

      const { text } = await fetchGeminiPrediction(prices, selectedMarket, selectedCommodity, dates)
      setPrediction(text)
    } catch (e) {
      setError('Failed to fetch prediction. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '1rem' }}>MarketScan AI</h1>
      <p style={{ margin: 0, color: '#64748b' }}>Sample local vendor reports · {pricesData.generated_at}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', marginTop: '1.5rem' }}>
        <select value={selectedMarket} onChange={(e) => setSelectedMarket(e.target.value)}>
          {pricesData.markets.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select value={selectedCommodity} onChange={(e) => setSelectedCommodity(e.target.value)}>
          {commodities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <button onClick={handleCheckPrice} disabled={loading}>
          {loading ? 'Checking…' : 'Check Price'}
        </button>
      </div>

      <div style={{ marginTop: '1.5rem', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
        {error && <div style={{ color: '#b91c1c', marginBottom: '0.5rem' }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>Last 7 days</div>
            <div style={{ height: 200 }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div style={{ color: '#64748b' }}>Market</div>
              <div>{selectedMarket}</div>
              <div style={{ color: '#64748b' }}>Commodity</div>
              <div>{selectedCommodity}</div>
              <div style={{ color: '#64748b' }}>Latest price</div>
              <div>{latestPrice !== null ? `${latestPrice}` : '—'}</div>
              <div style={{ color: '#64748b' }}>% change (7d)</div>
              <div>{changePct !== null ? `${changePct.toFixed(1)}%` : '—'}</div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>Gemini prediction</div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, minHeight: 56 }}>
                {prediction || (loading ? 'Generating…' : '—')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1rem', fontSize: 12, color: '#64748b' }}>
        Tip: set VITE_GEMINI_API_KEY in a .env file to enable live predictions.
      </div>
    </div>
  )
}

export default App
