const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const BITPANDA_BASE = 'https://api.bitpanda.com/v1';

app.get('/api/*', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key mancante' });

  const endpoint = req.path.replace('/api', '');
  try {
    const response = await fetch(BITPANDA_BASE + endpoint, {
      headers: { 'X-API-KEY': apiKey }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy attivo su porta ${PORT}`));
