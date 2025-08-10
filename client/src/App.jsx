import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  Legend,
} from "chart.js";
import localData from "./data/prices.json";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  Legend
);

const BACKEND_BASE = "http://localhost:8000";

async function apiGet(path) {
  const res = await fetch(`${BACKEND_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

function computeChangePercent(prices) {
  if (!prices || prices.length < 2) return 0;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

function computeFeaturedFromDataset(dataset, limit = 6, cityFilter) {
  try {
    const marketsMeta = dataset?.markets_meta || {};
    const itemsMeta = dataset?.items_meta || {};
    const data = dataset?.data || {};
    const results = [];
    for (const market of Object.keys(data)) {
      if (cityFilter) {
        const mCity = (marketsMeta[market]?.city || "").toLowerCase();
        if (mCity !== cityFilter.toLowerCase()) continue;
      }
      const items = data[market] || {};
      for (const commodity of Object.keys(items)) {
        const prices = items[commodity] || [];
        const latest = prices.length ? prices[prices.length - 1] : null;
        const change = computeChangePercent(prices);
        results.push({
          market,
          commodity,
          latest_price: latest,
          change_percent: change,
          market_meta: marketsMeta[market] || {},
          item_meta: itemsMeta[commodity] || {},
        });
      }
    }
    results.sort(
      (a, b) =>
        Math.abs(b.change_percent || 0) - Math.abs(a.change_percent || 0)
    );
    return results.slice(0, limit);
  } catch {
    return [];
  }
}

function App() {
  const [markets, setMarkets] = useState([]);
  const [marketsMeta, setMarketsMeta] = useState({});
  const [selectedMarket, setSelectedMarket] = useState("");
  const [commodities, setCommodities] = useState([]);
  const [itemsMeta, setItemsMeta] = useState({});
  const [selectedCommodity, setSelectedCommodity] = useState("");

  const [dates, setDates] = useState([]);
  const [series, setSeries] = useState([]);
  const [latestPrice, setLatestPrice] = useState(null);
  const [changePct, setChangePct] = useState(null);

  const [prediction, setPrediction] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [tip, setTip] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [askText, setAskText] = useState("");
  const [searchText, setSearchText] = useState("");

  const [city, setCity] = useState("");
  const [featured, setFeatured] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Load markets + meta and featured on mount
  useEffect(() => {
    // Seed UI instantly from local dataset
    try {
      const localMarkets = localData?.markets || [];
      if (localMarkets.length > 0) {
        setMarkets(localMarkets);
        setMarketsMeta(localData?.markets_meta || {});
        setItemsMeta(localData?.items_meta || {});
        if (!selectedMarket) setSelectedMarket(localMarkets[0]);
      }
      setFeatured(computeFeaturedFromDataset(localData, 6));
    } catch {
      // ignore
    }

    // Then refresh markets/meta from backend if available
    (async () => {
      try {
        const data = await apiGet("/markets");
        const list = data.markets || [];
        if (list.length) {
          setMarkets(list);
          setMarketsMeta(data.markets_meta || {});
          if (!selectedMarket) setSelectedMarket(list[0]);
        }
      } catch {
        // Silently keep local data if backend unavailable
      }
    })();
  }, []);

  // Load commodities when market changes
  useEffect(() => {
    if (!selectedMarket) return;
    (async () => {
      try {
        const data = await apiGet(
          `/commodities/${encodeURIComponent(selectedMarket)}`
        );
        const list = data.commodities || [];
        setCommodities(list);
        setItemsMeta(data.items_meta || {});
        if (list.length > 0) setSelectedCommodity(list[0]);
      } catch {
        setError("Failed to load commodities from backend.");
      }
    })();
  }, [selectedMarket]);

  // Fetch prices helper
  async function fetchPrices(market, commodity) {
    const data = await apiGet(
      `/prices/${encodeURIComponent(market)}/${encodeURIComponent(commodity)}`
    );
    return data; // {prices, dates, latest_price, change_percent, meta}
  }

  // Predict helper (let backend read dataset if no prices sent)
  async function fetchPrediction(market, commodity, prices, dates) {
    const data = await apiPost("/predict", {
      market,
      commodity,
      prices,
      dates,
    });
    return data; // {prediction, confidence, tip}
  }

  // City filter changes featured list (from local dataset)
  useEffect(() => {
    setFeatured(computeFeaturedFromDataset(localData, 6, city));
  }, [city]);

  const chartData = useMemo(() => {
    return {
      labels: (dates || []).map((d) => (d || "").slice(5)),
      datasets: [
        {
          data: series,
          borderColor: "#6366f1",
          backgroundColor: "rgba(99, 102, 241, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#6366f1",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          label: "Price Trend",
        },
      ],
    };
  }, [series, dates]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { color: "#374151" } },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          titleColor: "#1e293b",
          bodyColor: "#1e293b",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: true,
          padding: 12,
          boxPadding: 4,
          callbacks: {
            label: function (context) {
              return `${context.dataset.label}: ${context.parsed.y} ETB/kg`;
            },
          },
        },
      },
      scales: {
        x: {
          display: true,
          grid: { color: "rgba(241, 245, 249, 0.8)" },
          ticks: { color: "#64748b", font: { size: 11 } },
        },
        y: {
          display: true,
          grid: { color: "rgba(241, 245, 249, 0.8)" },
          ticks: { color: "#64748b", font: { size: 11 } },
          beginAtZero: false,
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
      if (!selectedMarket || !selectedCommodity) {
        setError("Select a market and commodity.");
        return;
      }

      // Fetch prices from backend
      const priceData = await fetchPrices(selectedMarket, selectedCommodity);
      const prices = priceData.prices || [];
      setDates(priceData.dates || []);
      setSeries(prices);
      setLatestPrice(
        priceData.latest_price ??
          (prices.length ? prices[prices.length - 1] : null)
      );
      setChangePct(priceData.change_percent ?? computeChangePercent(prices));

      // Get AI prediction
      const pred = await fetchPrediction(
        selectedMarket,
        selectedCommodity,
        prices,
        priceData.dates || []
      );
      setPrediction(pred.prediction);
      setConfidence(pred.confidence);
      setTip(pred.tip);
    } catch {
      setError("Failed to fetch data from backend.");
    } finally {
      setLoading(false);
    }
  }

  function parseAsk(text) {
    const t = (text || "").toLowerCase();
    let foundMarket = markets.find((m) => t.includes(m.toLowerCase()));
    let foundCommodity = commodities.find((c) => t.includes(c.toLowerCase()));
    // Fallback: try simple pattern "X in Y"
    if (!foundCommodity && t.includes(" in ")) {
      const [left, right] = t.split(" in ");
      if (left)
        foundCommodity = commodities.find((c) =>
          left.includes(c.toLowerCase())
        );
      if (right)
        foundMarket = markets.find((m) => right.includes(m.toLowerCase()));
    }
    return { market: foundMarket, commodity: foundCommodity };
  }

  function parseTopSearch(text) {
    const q = (text || "").toLowerCase();
    const marketsList = markets || [];
    const commoditiesList =
      localData?.commodities || Object.keys(localData?.items_meta || {}) || [];
    let foundMarket = marketsList.find((m) => q.includes(m.toLowerCase()));
    let foundCommodity = commoditiesList.find((c) =>
      q.includes(c.toLowerCase())
    );
    if (!foundCommodity && q.includes(" in ")) {
      const [left, right] = q.split(" in ");
      if (left) {
        foundCommodity = commoditiesList.find((c) =>
          left.includes(c.toLowerCase())
        );
      }
      if (right) {
        foundMarket = marketsList.find((m) => right.includes(m.toLowerCase()));
      }
    }
    return { market: foundMarket, commodity: foundCommodity };
  }

  async function handleSearch() {
    const { market, commodity } = parseTopSearch(searchText);
    if (!market && !commodity) return;
    if (market) setSelectedMarket(market);
    if (commodity) setSelectedCommodity(commodity);
    setTimeout(() => handleCheckPrice(), 0);
  }

  async function handleAsk() {
    setError("");
    const { market, commodity } = parseAsk(askText);
    if (!market || !commodity) {
      setError("Please ask like: 'onion in Merkato'.");
      return;
    }
    setSelectedMarket(market);
    setSelectedCommodity(commodity);
    // Wait a tick for state, then fetch
    setTimeout(() => handleCheckPrice(), 0);
  }

  const isPositiveChange = changePct !== null && changePct > 0;
  const isNegativeChange = changePct !== null && changePct < 0;

  function MarketBadge({ market }) {
    const meta = marketsMeta[market] || {};
    const c = meta.city || "—";
    return (
      <span className="market-badge">
        <span className="market-name">{market}</span>
        <span className="market-city">{c}</span>
      </span>
    );
  }

  function ItemBadge({ item }) {
    const meta = itemsMeta[item] || {};
    const cat = meta.category || "—";
    const catClass = `cat-${String(cat)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`;
    return (
      <span className={`item-badge ${catClass}`}>
        <span className="item-name">{item}</span>
        <span className="item-category">{cat}</span>
      </span>
    );
  }

  function renderDashboard() {
    return (
      <div className="dashboard">
        {/* Featured section */}
        <div className="section">
          <div className="section-header">
            <h2>🔥 Featured Today</h2>
            <div className="city-filter">
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">All cities</option>
                {[
                  ...new Set(
                    Object.values(marketsMeta)
                      .map((m) => m.city)
                      .filter(Boolean)
                  ),
                ].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="featured-grid">
            {featured.map((f, idx) => {
              const cat = f.item_meta?.category || "";
              const catClass = `cat-${String(cat)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}`;
              return (
                <div
                  key={`${f.market}-${f.commodity}-${idx}`}
                  className={`featured-card ${catClass}`}
                  onClick={async () => {
                    setSelectedMarket(f.market);
                    setSelectedCommodity(f.commodity);
                    await handleCheckPrice();
                  }}
                >
                  <div className="featured-header">
                    <ItemBadge item={f.commodity} />
                    <MarketBadge market={f.market} />
                  </div>
                  <div className="featured-price">
                    {f.latest_price} ETB/
                    {f.item_meta && f.item_meta.unit ? f.item_meta.unit : "kg"}
                  </div>
                  <div
                    className={`featured-change ${
                      (f.change_percent || 0) > 0
                        ? "positive"
                        : (f.change_percent || 0) < 0
                        ? "negative"
                        : "neutral"
                    }`}
                  >
                    {(f.change_percent || 0) > 0
                      ? "↗"
                      : (f.change_percent || 0) < 0
                      ? "↘"
                      : "→"}{" "}
                    {Math.abs(f.change_percent || 0).toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Market analysis section */}
        <div className="section">
          <div className="section-header">
            <h2>📈 Market Analysis</h2>
          </div>

          <div className="analysis-container">
            <div className="market-selector">
              <div className="selector-group">
                <label>Market</label>
                <select
                  value={selectedMarket}
                  onChange={(e) => setSelectedMarket(e.target.value)}
                >
                  {markets.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="selector-group">
                <label>Commodity</label>
                <select
                  value={selectedCommodity}
                  onChange={(e) => setSelectedCommodity(e.target.value)}
                >
                  {commodities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleCheckPrice}
                disabled={loading}
                className="check-price-btn"
              >
                {loading ? "🔍 Checking..." : "📊 Check Price"}
              </button>
            </div>

            <div className="ai-ask">
              <input
                value={askText}
                onChange={(e) => setAskText(e.target.value)}
                placeholder="Ask AI: 'What's the price of onion in Merkato?'"
                onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              />
              <button onClick={handleAsk}>Ask</button>
            </div>
          </div>

          {error && <div className="error-banner">⚠️ {error}</div>}

          <div className="data-visualization">
            <div className="chart-container">
              <h3>Price Trend</h3>
              <div className="chart-wrapper">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>

            <div className="market-details">
              <h3>Market Details</h3>
              <div className="details-grid">
                <div className="detail-card">
                  <div className="detail-label">Market</div>
                  <div className="detail-value">{selectedMarket || "—"}</div>
                </div>

                <div className="detail-card">
                  <div className="detail-label">Commodity</div>
                  <div className="detail-value">{selectedCommodity || "—"}</div>
                </div>

                <div className="detail-card">
                  <div className="detail-label">Latest Price</div>
                  <div className="detail-value">
                    {latestPrice !== null
                      ? `${latestPrice} ETB/${
                          itemsMeta[selectedCommodity]?.unit || "kg"
                        }`
                      : "—"}
                  </div>
                </div>

                <div className="detail-card">
                  <div className="detail-label">7-Day Change</div>
                  <div
                    className={`detail-value ${
                      isPositiveChange
                        ? "positive"
                        : isNegativeChange
                        ? "negative"
                        : "neutral"
                    }`}
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
            </div>
          </div>
        </div>

        {/* AI Insights */}
        <div className="section">
          <div className="section-header">
            <h2>🤖 AI Insights</h2>
          </div>

          <div className="ai-insights">
            <div className="ai-card">
              <div className="ai-header">
                <h3>Market Prediction</h3>
                {confidence && (
                  <div className="confidence-badge">
                    Confidence: {confidence}
                  </div>
                )}
              </div>

              <div className="ai-content">
                {loading ? (
                  <div className="ai-loading">Generating insights...</div>
                ) : prediction ? (
                  <>
                    <p className="prediction">{prediction}</p>
                    {tip && (
                      <div className="tip-card">
                        <div className="tip-icon">💡</div>
                        <div className="tip-text">{tip}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="ai-placeholder">
                    Select market and commodity to get AI insights
                  </div>
                )}
              </div>
            </div>

            <div className="ai-examples">
              <h4>Try asking:</h4>
              <ul>
                <li>"Price of teff in Bole"</li>
                <li>"Onion trend in Merkato"</li>
                <li>"Show me coffee prices"</li>
                <li>"What should I do with tomatoes?"</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderInsights() {
    return (
      <div className="insights-page">
        <div className="section">
          <div className="section-header">
            <h2>📊 Market Insights</h2>
          </div>

          <div className="insights-grid">
            <div className="insight-card">
              <h3>Seasonal Trends</h3>
              <p>
                Onion prices typically peak during July-September due to harvest
                cycles
              </p>
              <div className="trend-badge">Peak Season</div>
            </div>

            <div className="insight-card">
              <h3>Regional Variations</h3>
              <p>
                Coffee prices in Hawassa are 8-10% lower than in Addis Ababa
                markets
              </p>
              <div className="trend-badge positive">Cost Saving</div>
            </div>

            <div className="insight-card">
              <h3>Supply Chain</h3>
              <p>
                Teff remains stable year-round due to robust national supply
                chains
              </p>
              <div className="trend-badge neutral">Stable</div>
            </div>

            <div className="insight-card">
              <h3>Upcoming Events</h3>
              <p>
                Expect price volatility during Meskel festival (September 27)
              </p>
              <div className="trend-badge warning">Volatility</div>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-header">
            <h2>📈 Commodity Analysis</h2>
          </div>

          <div className="commodity-stats">
            <div className="stat-card">
              <div className="stat-value">+24%</div>
              <div className="stat-label">Onion Price Increase</div>
              <div className="stat-desc">Last 14 days in Merkato</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">-3%</div>
              <div className="stat-label">Tomato Price Change</div>
              <div className="stat-desc">Weekly average across markets</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">82%</div>
              <div className="stat-label">AI Confidence</div>
              <div className="stat-desc">In teff price predictions</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar ${isMenuOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">🥬</div>
            <h1>Ethio Market Scan</h1>
          </div>
          <button className="close-menu" onClick={() => setIsMenuOpen(false)}>
            &times;
          </button>
        </div>

        <div className="sidebar-menu">
          <button
            className={`menu-item ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            📊 Dashboard
          </button>
          <button
            className={`menu-item ${activeTab === "insights" ? "active" : ""}`}
            onClick={() => setActiveTab("insights")}
          >
            🔍 Insights
          </button>
          <button className="menu-item">📈 Reports</button>
          <button className="menu-item">⚙️ Settings</button>
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">GM</div>
            <div className="user-details">
              <div className="user-name">Glazchew Mohammed</div>
              <div className="user-email">graachew980@gmail.com</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="main-content">
        {/* Top bar */}
        <div className="top-bar">
          <button
            className="menu-toggle"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            ☰
          </button>
          <div className="search-bar">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search: 'onion in Merkato' or 'teff Bole'"
            />
            <button onClick={handleSearch}>🔍</button>
          </div>
          <div className="user-actions">
            <button className="notification-btn">🔔</button>
            <div className="user-badge">
              <div className="user-avatar">GM</div>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="content-area">
          {activeTab === "dashboard" ? renderDashboard() : renderInsights()}
        </div>

        {/* Footer */}
        <div className="footer">
          <div className="footer-content">
            <div className="footer-logo">🥬 Ethio Market Scan</div>
            <div className="footer-links">
              <a href="#">Documentation</a>
              <a href="#">API Status</a>
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
            </div>
            <div className="footer-info">
              Backend: {BACKEND_BASE} | Version 1.2.0
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
