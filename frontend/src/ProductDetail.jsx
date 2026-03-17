import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import SubscribeModal from './SubscribeModal';

const API_URL = 'http://localhost:3000/api';

export default function ProductDetail({ product, onBack }) {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ lowest: 0, average: 0 });
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`${API_URL}/history/${product.id}`);
        const data = await response.json();
        
        // 1. Transform data for Recharts (format date string)
        const chartData = data.map(item => ({
          date: new Date(item.recorded_at).toLocaleDateString(),
          price: parseFloat(item.price)
        }));
        setHistory(chartData);

        // 2. Calculate Statistics
        if (chartData.length > 0) {
          const prices = chartData.map(d => d.price);
          const lowest = Math.min(...prices);
          const average = prices.reduce((a, b) => a + b, 0) / prices.length;
          
          setStats({
            lowest: lowest.toFixed(2),
            average: average.toFixed(2)
          });
        }
      } catch (error) {
        console.error("Failed to fetch history:", error);
      }
    };

    fetchHistory();
  }, [product.id]);

  return (
    <div className="product-detail">
      <button onClick={onBack}>&larr; Back to Dashboard</button>
      
      <div className="detail-header">
        <h2>{product.title}</h2>
        <div className="stats-container">
          <p>Current: <strong>₹{product.current_price}</strong></p>
          <p>Lowest: <strong>₹{stats.lowest}</strong></p>
          <p>Average: <strong>₹{stats.average}</strong></p>
        </div>
        <button onClick={() => setShowModal(true)}>Alert Me on Price Drop</button>
      </div>

      <div className="chart-container" style={{ height: '400px', marginTop: '20px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            {/* domain={['auto', 'auto']} makes the graph dynamic so drops look dramatic */}
            <YAxis domain={['auto', 'auto']} tickFormatter={(value) => `₹${value}`} />
            <Tooltip formatter={(value) => [`₹${value}`, 'Price']} />
            <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showModal && (
        <SubscribeModal 
          productId={product.id} 
          currentPrice={product.current_price}
          onClose={() => setShowModal(false)} 
        />
      )}
    </div>
  );
}