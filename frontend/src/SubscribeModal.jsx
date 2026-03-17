import { useState } from 'react';

const API_URL = 'http://localhost:3000/api';

export default function SubscribeModal({ productId, currentPrice, onClose }) {
  // Pre-fill target price 5% lower than current price
  const suggestedTarget = Math.floor(currentPrice * 0.95);
  
  const [targetPrice, setTargetPrice] = useState(suggestedTarget);
  const [whatsapp, setWhatsapp] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('Saving...');

    try {
      const response = await fetch(`${API_URL}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: "00000000-0000-0000-0000-000000000000", // Hardcoded UUID for testing without full auth
          product_id: productId,
          target_price: targetPrice,
          whatsapp_number: whatsapp
        })
      });

      if (response.ok) {
        setStatus('Alert Set Successfully!');
        setTimeout(onClose, 1500); // Close modal after success
      }
    } catch (error) {
      setStatus('Failed to set alert.');
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="modal-content" style={{ background: 'white', padding: '2rem', borderRadius: '8px' }}>
        <h3>Set Price Alert</h3>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label>Target Price (₹): </label>
            <input 
              type="number" 
              value={targetPrice} 
              onChange={(e) => setTargetPrice(Number(e.target.value))}
              required 
            />
          </div>
          
          <div>
            <label>WhatsApp Number: </label>
            <input 
              type="tel" 
              placeholder="+919876543210" 
              value={whatsapp} 
              onChange={(e) => setWhatsapp(e.target.value)}
              required 
            />
          </div>

          <button type="submit">Confirm Alert</button>
          <button type="button" onClick={onClose}>Cancel</button>
          
          {status && <p>{status}</p>}
        </form>
      </div>
    </div>
  );
}