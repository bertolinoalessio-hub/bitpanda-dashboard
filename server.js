const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.BITPANDA_API_KEY;
const BASE_URL = 'https://api.bitpanda.com/v1';

app.use(cors());
app.use(express.json());

// --- Helper per chiamate Bitpanda ---
async function bitpandaFetch(endpoint) {
  if (!API_KEY) throw new Error('BITPANDA_API_KEY non configurata');
  
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'X-Api-Key': API_KEY,
      'Accept': 'application/json'
    }
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bitpanda ${endpoint} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// --- Helper paginazione (per /trades e /fiatwallets/transactions) ---
async function fetchAllPaged(endpoint) {
  let all = [];
  let page = 1;
  const pageSize = 500;
  
  while (true) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${endpoint}${separator}page=${page}&page_size=${pageSize}`;
    const result = await bitpandaFetch(url);
    
    const items = result.data || [];
    all = all.concat(items);
    
    // Se abbiamo ricevuto meno del pageSize, siamo alla fine
    if (items.length < pageSize) break;
    page++;
    
    // Safety net contro loop infiniti
    if (page > 50) break;
  }
  return all;
}

// --- Endpoint: health ---
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// --- Endpoint: portfolio (asset + fiat + ticker) ---
app.get('/portfolio', async (req, res) => {
  try {
    const [assets, fiats, ticker] = await Promise.all([
      bitpandaFetch('/asset-wallets'),
      bitpandaFetch('/fiatwallets'),
      bitpandaFetch('/ticker')
    ]);
    res.json({ assets, fiats, ticker });
  } catch (err) {
    console.error('[/portfolio]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Endpoint: summary (depositi + trades, con paginazione) ---
app.get('/summary', async (req, res) => {
  try {
    const [fiatTx, trades] = await Promise.all([
      fetchAllPaged('/fiatwallets/transactions'),
      fetchAllPaged('/trades')
    ]);
    res.json({ fiatTransactions: fiatTx, trades });
  } catch (err) {
    console.error('[/summary]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Root: info di servizio ---
app.get('/', (req, res) => {
  res.json({
    service: 'bitpanda-proxy',
    endpoints: ['/health', '/portfolio', '/summary']
  });
});

app.listen(PORT, () => {
  console.log(`Proxy Bitpanda in ascolto su porta ${PORT}`);
});
