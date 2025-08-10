import { useMemo, useState } from "react";
import "./App.css";
import pricesData from "./data/prices.json";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler
);

async function fetchPredictionFromBackend(prices, market, commodity, dates) {
  try {
    const response = await fetch("http://localhost:8000/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prices: prices,
        market: market,
        commodity: commodity,
        dates: dates,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching prediction:", error);
    // Fallback response
    return {
      prediction: "Backend connection failed - using fallback",
      confidence: "60%",
      tip: "Check backend server status",
      raw_response: "Fallback response",
    };
  }
}

function computeChangePercent(prices) {
  if (!prices || prices.length < 2) return 0;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

function App() {
  const [selectedMarket, setSelectedMarket] = useState(
    pricesData.markets[0] || ""
  );
  const commodities = useMemo(() => {
    const marketData = pricesData.data[selectedMarket] || {};
    return Object.keys(marketData);
  }, [selectedMarket]);

  const [selectedCommodity, setSelectedCommodity] = useState("onion");
  const [latestPrice, setLatestPrice] = useState(null);
  const [changePct, setChangePct] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [tip, setTip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const dates = pricesData.dates;

  const series = useMemo(() => {
    const marketData = pricesData.data[selectedMarket] || {};
    return marketData[selectedCommodity] || [];
  }, [selectedMarket, selectedCommodity]);

  const chartData = useMemo(() => {
    return {
      labels: dates.map((d) => d.slice(5)),
      datasets: [
        {
          data: series,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#3b82f6",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
        },
      ],
    };
  }, [series, dates]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          borderColor: "#3b82f6",
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: false,
        },
      },
      scales: {
        x: {
          display: true,
          grid: {
            color: "rgba(0, 0, 0, 0.05)",
          },
          ticks: {
            color: "#6b7280",
            font: {
              size: 12,
            },
          },
        },
        y: {
          display: true,
          grid: {
            color: "rgba(0, 0, 0, 0.05)",
          },
          ticks: {
            color: "#6b7280",
            font: {
              size: 12,
            },
          },
        },
      },
    }),
    []
  );

  async function handleCheckPrice() {
    setError("");
    setPrediction(null);
    setConfidence(null);
    setTip(null);
    setLoading(true);
    try {
      const prices = series;
      if (!prices || prices.length === 0) {
        setError("No data found for the selected market and commodity.");
        setLoading(false);
        return;
      }
      const last = prices[prices.length - 1];
      setLatestPrice(last);
      setChangePct(computeChangePercent(prices));

      const result = await fetchPredictionFromBackend(
        prices,
        selectedMarket,
        selectedCommodity,
        dates
      );

      setPrediction(result.prediction);
      setConfidence(result.confidence);
      setTip(result.tip);
    } catch (e) {
      setError("Failed to fetch prediction. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  const isPositiveChange = changePct !== null && changePct > 0;
  const isNegativeChange = changePct !== null && changePct < 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "2rem 1rem",
      }}
    >
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          background: "rgba(255, 255, 255, 0.95)",
          borderRadius: 20,
          padding: "2.5rem",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.5rem",
              fontWeight: 700,
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: "0.5rem",
            }}
          >
            🥬 MarketScan AI
          </h1>
          <p
            style={{
              margin: 0,
              color: "#6b7280",
              fontSize: "1rem",
              fontWeight: 500,
            }}
          >
            Sample local vendor reports · {pricesData.generated_at}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <select
            value={selectedMarket}
            onChange={(e) => setSelectedMarket(e.target.value)}
            style={{
              padding: "12px 16px",
              border: "2px solid #e5e7eb",
              borderRadius: 12,
              fontSize: "1rem",
              fontWeight: 500,
              backgroundColor: "#ffffff",
              cursor: "pointer",
              transition: "all 0.2s ease",
              outline: "none",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#3b82f6";
              e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e5e7eb";
              e.target.style.boxShadow = "none";
            }}
          >
            {pricesData.markets.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={selectedCommodity}
            onChange={(e) => setSelectedCommodity(e.target.value)}
            style={{
              padding: "12px 16px",
              border: "2px solid #e5e7eb",
              borderRadius: 12,
              fontSize: "1rem",
              fontWeight: 500,
              backgroundColor: "#ffffff",
              cursor: "pointer",
              transition: "all 0.2s ease",
              outline: "none",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#3b82f6";
              e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e5e7eb";
              e.target.style.boxShadow = "none";
            }}
          >
            {commodities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button
            onClick={handleCheckPrice}
            disabled={loading}
            style={{
              padding: "12px 24px",
              border: "none",
              borderRadius: 12,
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              background: loading
                ? "#9ca3af"
                : "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              color: "#ffffff",
              boxShadow: loading
                ? "none"
                : "0 4px 12px rgba(59, 130, 246, 0.3)",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 6px 20px rgba(59, 130, 246, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.3)";
              }
            }}
          >
            {loading ? "🔍 Checking…" : "📊 Check Price"}
          </button>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: "2rem",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)",
          }}
        >
          {error && (
            <div
              style={{
                color: "#dc2626",
                marginBottom: "1rem",
                padding: "12px 16px",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                fontSize: "0.9rem",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "2rem",
            }}
          >
            <div>
              <div
                style={{
                  marginBottom: "1rem",
                  fontWeight: 600,
                  fontSize: "1.1rem",
                  color: "#374151",
                }}
              >
                📈 Last 7 Days Trend
              </div>
              <div
                style={{
                  height: 250,
                  padding: "1rem",
                  background: "#f8fafc",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                }}
              >
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>

            <div>
              <div
                style={{
                  marginBottom: "1rem",
                  fontWeight: 600,
                  fontSize: "1.1rem",
                  color: "#374151",
                }}
              >
                📋 Market Details
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div
                  style={{
                    padding: "12px",
                    background: "#f8fafc",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      marginBottom: "4px",
                    }}
                  >
                    Market
                  </div>
                  <div style={{ fontWeight: 600, color: "#374151" }}>
                    {selectedMarket}
                  </div>
                </div>

                <div
                  style={{
                    padding: "12px",
                    background: "#f8fafc",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      marginBottom: "4px",
                    }}
                  >
                    Commodity
                  </div>
                  <div style={{ fontWeight: 600, color: "#374151" }}>
                    {selectedCommodity}
                  </div>
                </div>

                <div
                  style={{
                    padding: "12px",
                    background: "#f8fafc",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      marginBottom: "4px",
                    }}
                  >
                    Latest Price
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#374151",
                      fontSize: "1.1rem",
                    }}
                  >
                    {latestPrice !== null ? `${latestPrice} ETB` : "—"}
                  </div>
                </div>

                <div
                  style={{
                    padding: "12px",
                    background: "#f8fafc",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      marginBottom: "4px",
                    }}
                  >
                    7-Day Change
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "1.1rem",
                      color: isPositiveChange
                        ? "#059669"
                        : isNegativeChange
                        ? "#dc2626"
                        : "#6b7280",
                    }}
                  >
                    {changePct !== null ? (
                      <span>
                        {isPositiveChange ? "↗" : isNegativeChange ? "↘" : "→"}{" "}
                        {changePct.toFixed(1)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div
                  style={{
                    marginBottom: "0.75rem",
                    fontWeight: 600,
                    fontSize: "1rem",
                    color: "#374151",
                  }}
                >
                  🤖 AI Prediction
                </div>
                <div
                  style={{
                    background:
                      "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                    border: "2px solid #e5e7eb",
                    borderRadius: 12,
                    padding: "1rem",
                    minHeight: 80,
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                    color: "#374151",
                  }}
                >
                  {loading ? (
                    "🤔 Generating prediction..."
                  ) : prediction ? (
                    <div>
                      <div style={{ marginBottom: "8px", fontWeight: 600 }}>
                        {prediction}
                      </div>
                      {confidence && (
                        <div
                          style={{
                            marginBottom: "8px",
                            color: "#059669",
                            fontWeight: 500,
                          }}
                        >
                          Confidence: {confidence}
                        </div>
                      )}
                      {tip && (
                        <div
                          style={{
                            color: "#3b82f6",
                            fontWeight: 500,
                            fontStyle: "italic",
                          }}
                        >
                          💡 {tip}
                        </div>
                      )}
                    </div>
                  ) : (
                    "Select market and commodity, then click Check Price"
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "1.5rem",
            textAlign: "center",
            fontSize: "0.85rem",
            color: "#6b7280",
            padding: "1rem",
            background: "#f8fafc",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
          }}
        >
          💡 <strong>Pro tip:</strong> Make sure the backend server is running
          on http://localhost:8000 for real AI predictions
        </div>
      </div>
    </div>
  );
}

export default App;
