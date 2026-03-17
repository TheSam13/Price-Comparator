import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Search, Zap, Loader2, ExternalLink, Trophy, TrendingDown } from 'lucide-react';

export default function App() {
  const [query, setQuery] = useState('');
  const [pincode, setPincode] = useState(''); 
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // Dynamic Loading States
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  const loadingMessages = [
    "Spinning up the headless browsers...",
    "Bypassing Amazon's anti-bot defenses...",
    "Flattening the Flipkart React DOM...",
    "Walking the Blinkit component tree...",
    "Doing the math... (our free servers are trying their best!)"
  ];

  // Cycles through the messages every 3.5 seconds while loading
  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => {
        setLoadingMsgIdx((prev) => (prev + 1) % loadingMessages.length);
      }, 3500);
    } else {
      setLoadingMsgIdx(0); // Reset when done
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleSearch = async () => {
    if (!query) return;
    
    setLoading(true);
    setError('');
    setData(null);

    try {
      const response = await fetch('https://intelliprice-backend.onrender.com/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          searchQuery: query,
          pincode: pincode 
        })
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Failed to fetch data');
      
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- SMART VERDICT LOGIC ---
  let chartData = [];
  let maxPrice = 0;
  let minPrice = 0;
  let savings = 0;
  let winnerDetails = null;
  let alternatePlatforms = []; 

  if (data) {
    // 1. Build the Bar Chart Data dynamically
    chartData = [
      { name: 'Amazon', price: data.amazon?.price || 0, fill: '#f59e0b' },
      { name: 'Flipkart', price: data.flipkart?.price || 0, fill: '#3b82f6' },
      { name: 'Blinkit', price: data.blinkit?.price || 0, fill: '#facc15' },
    ].filter(item => item.price > 0); 

    // 2. Calculate savings
    const prices = chartData.map(d => d.price);
    if (prices.length > 1) {
      maxPrice = Math.max(...prices);
      minPrice = Math.min(...prices);
      savings = maxPrice - minPrice;
    }

    // 3. Extract the winner's specific data
    if (data.recommendation && data.recommendation !== 'Draw') {
      const winnerKey = data.recommendation.toLowerCase();
      winnerDetails = data[winnerKey];

      // 4. Extract alternates 
      const allPlatforms = [
        { name: 'Amazon', info: data.amazon },
        { name: 'Flipkart', info: data.flipkart },
        { name: 'Blinkit', info: data.blinkit }
      ];
      
      alternatePlatforms = allPlatforms.filter(p => 
        p.name !== data.recommendation && 
        p.info && 
        p.info.link !== '#' && 
        p.info.price > 0
      );
    }
  }

  // Custom Tooltip for the Bar Chart
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/90 border border-white/10 p-3 rounded-xl shadow-xl">
          <p className="text-white/60 text-xs uppercase tracking-wider mb-1">{payload[0].payload.name}</p>
          <p className="text-white font-bold text-lg">₹{payload[0].value.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#050505] relative flex items-center justify-center p-4 sm:p-8 font-sans overflow-hidden text-slate-200">
      
      {/* Background Orbs & Grain */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-screen" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

      <div className="relative w-full max-w-5xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 sm:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-bold tracking-tighter text-white flex items-center gap-3">
            <div className="bg-indigo-500/20 p-2 rounded-xl border border-indigo-500/30">
              <Zap className="text-indigo-400" size={24} />
            </div>
            IntelliPrice
          </h1>
        </div>

        {/* Search Bar & Pincode */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 group">
          <div className="relative flex-grow">
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for a product (e.g., Samsung Galaxy M06)..."
              className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl text-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-white shadow-inner"
            />
          </div>
          <div className="relative w-full sm:w-48">
            <input 
              type="text" 
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Pincode / City"
              className="w-full bg-black/40 border border-white/10 p-5 rounded-2xl text-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-white shadow-inner"
            />
          </div>
          <button 
            onClick={handleSearch}
            disabled={loading}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white p-5 rounded-2xl transition-colors flex items-center justify-center min-w-[70px]"
          >
            {loading ? <Loader2 size={24} className="animate-spin" /> : <Search size={24} />}
          </button>
        </div>

        {/* Error Message */}
        {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center">{error}</div>}

        {/* 🚀 Dynamic Loading State */}
        {loading && (
          <div className="mb-10 flex flex-col items-center justify-center p-8 bg-indigo-500/5 border border-indigo-500/20 rounded-3xl">
            <Loader2 size={40} className="text-indigo-400 animate-spin mb-4" />
            <p className="text-indigo-300 text-lg font-medium text-center transition-all duration-500 ease-in-out">
              {loadingMessages[loadingMsgIdx]}
            </p>
            <p className="text-white/40 text-sm mt-3 text-center max-w-md">
              (Live scraping multiple heavy sites on a free tier server takes 15-20 seconds. Grab a sip of water!)
            </p>
          </div>
        )}

        {/* 🏆 THE RESULTS GRID (HIDDEN WHILE LOADING) */}
        {!loading && data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              
              {/* AMAZON */}
              <div className={`p-6 rounded-2xl border relative overflow-hidden transition-colors ${data.recommendation === 'Amazon' ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-black/20 border-white/5'}`}>
                {data.recommendation === 'Amazon' && (
                  <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Best Price</div>
                )}
                <h3 className="text-white/40 text-sm font-semibold uppercase tracking-widest mb-4">Amazon</h3>
                <p className="text-4xl font-bold text-white">
                  {data.amazon?.price > 0 ? `₹${data.amazon.price.toLocaleString()}` : '---'}
                </p>
              </div>
              
              {/* FLIPKART */}
              <div className={`p-6 rounded-2xl border relative overflow-hidden transition-colors ${data.recommendation === 'Flipkart' ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-black/20 border-white/5'}`}>
                {data.recommendation === 'Flipkart' && (
                  <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Best Price</div>
                )}
                <h3 className="text-white/40 text-sm font-semibold uppercase tracking-widest mb-4">Flipkart</h3>
                <p className="text-4xl font-bold text-white">
                  {data.flipkart?.price > 0 ? `₹${data.flipkart.price.toLocaleString()}` : '---'}
                </p>
              </div>

              {/* BLINKIT */}
              <div className={`p-6 rounded-2xl border relative overflow-hidden transition-colors ${data.recommendation === 'Blinkit' ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-black/20 border-white/5'}`}>
                {data.recommendation === 'Blinkit' && (
                  <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Best Price</div>
                )}
                <h3 className="text-white/40 text-sm font-semibold uppercase tracking-widest mb-4">Blinkit</h3>
                <p className="text-4xl font-bold text-white">
                  {data.blinkit?.price > 0 ? `₹${data.blinkit.price.toLocaleString()}` : '---'}
                </p>
              </div>
              
            </div>

            {/* Smart Verdict & Bar Chart Section */}
            {chartData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Visual Price Gap (Bar Chart) */}
                <div className="bg-black/20 p-6 sm:p-8 rounded-3xl border border-white/5 flex flex-col justify-center">
                  <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest mb-6">Market Spread</h2>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 20 }}>
                        <XAxis type="number" hide domain={[0, maxPrice * 1.1]} />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#ffffff80', fontSize: 12 }} width={70} />
                        <Tooltip cursor={{fill: 'rgba(255,255,255,0.02)'}} content={<CustomTooltip />} />
                        <Bar dataKey="price" radius={[0, 4, 4, 0]} barSize={24}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} opacity={entry.name === data.recommendation ? 1 : 0.4} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Smart Verdict Box */}
                <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-6 sm:p-8 rounded-3xl border border-indigo-500/20 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute -right-6 -top-6 text-indigo-500/10 rotate-12 pointer-events-none">
                    <Trophy size={160} />
                  </div>
                  
                  <div className="z-10">
                    <h2 className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Zap size={16} /> Intelliprice Verdict
                    </h2>
                    
                    {winnerDetails ? (
                      <>
                        <h3 className="text-2xl font-bold text-white leading-tight mb-2 line-clamp-2">
                          {winnerDetails.title}
                        </h3>
                        
                        {savings > 0 ? (
                          <p className="text-slate-300 flex items-center gap-2 mb-6">
                            <span className="flex items-center text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-md text-sm font-medium">
                              <TrendingDown size={14} className="mr-1" />
                              Save ₹{savings.toLocaleString()}
                            </span>
                            <span>vs highest market price.</span>
                          </p>
                        ) : (
                          <p className="text-slate-400 mb-6 text-sm">Best available market price.</p>
                        )}
                      </>
                    ) : (
                      <p className="text-white/60 italic">Could not determine a clear winner.</p>
                    )}
                  </div>

                  {/* BUTTONS CONTAINER */}
                  <div className="z-10 mt-6 flex flex-col w-full">
                    
                    {/* 🏆 PRIMARY WINNER BUTTON */}
                    {winnerDetails && winnerDetails.link && winnerDetails.link !== '#' && (
                      <a 
                        href={winnerDetails.link} 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-medium py-3 px-6 rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
                      >
                        Buy on {data.recommendation}
                        <ExternalLink size={18} />
                      </a>
                    )}

                    {/* 🥈 SECONDARY OPTIONS */}
                    {alternatePlatforms.length > 0 && (
                      <div className="mt-5 pt-5 border-t border-indigo-500/20 w-full">
                        <p className="text-xs text-indigo-300/60 uppercase tracking-wider mb-3 font-semibold">
                          Other Available Options
                        </p>
                        <div className="flex flex-col gap-2">
                          {alternatePlatforms.map(platform => (
                            <a 
                              key={platform.name}
                              href={platform.info.link} 
                              target="_blank" 
                              rel="noreferrer"
                              className="flex justify-between items-center w-full bg-black/20 hover:bg-black/40 border border-white/5 hover:border-white/10 text-slate-300 hover:text-white text-sm py-2.5 px-4 rounded-xl transition-all"
                            >
                              <span className="flex items-center gap-2">
                                Buy on {platform.name}
                              </span>
                              <span className="font-semibold text-white/90">
                                ₹{platform.info.price.toLocaleString()}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
