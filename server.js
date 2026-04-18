const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const BASE_V1 = 'https://api.bitpanda.com/v1';

async function bpFetch(url, apiKey) {
  const res = await fetch(url, { headers: { 'X-API-KEY': apiKey } });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, body: data };
  return data;
}

async function bpFetchAll(endpoint, apiKey) {
  let page = 1;
  let all = [];
  while (true) {
    const data = await bpFetch(BASE_V1 + endpoint + '?page=' + page, apiKey);
    const items = data.data || [];
    all = all.concat(items);
    const meta = data.meta || {};
    const totalPages = meta.total_pages || meta.last_page || 1;
    if (page >= totalPages || items.length === 0) break;
    page++;
    if (page > 50) break;
  }
  return all;
}

app.get('/portfolio', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key mancante' });
  try {
    const [assetWallets, fiatWallets, ticker] = await Promise.allSettled([
      bpFetch(BASE_V1 + '/asset-wallets', apiKey),
      bpFetch(BASE_V1 + '/fiatwallets', apiKey),
      bpFetch(BASE_V1 + '/ticker', apiKey),
    ]);
    res.json({
      assetWallets: assetWallets.status === 'fulfilled' ? assetWallets.value : null,
      fiatWallets: fiatWallets.status === 'fulfilled' ? fiatWallets.value : null,
      ticker: ticker.status === 'fulfilled' ? ticker.value : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Transazioni via /wallets (history per wallet)
app.get('/summary', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key mancante' });
  try {
    // Usa /trades e /fiatwallets/transactions che funzionano con API key
    const [trades, fiatTx] = await Promise.allSettled([
      bpFetchAll('/trades', apiKey),
      bpFetchAll('/fiatwallets/transactions', apiKey),
    ]);

    let capitaleVersato = 0, numDepositi = 0;
    let totalAcquisti = 0, totalVendite = 0, reward = 0;

    // Depositi fiat
    if (fiatTx.status === 'fulfilled') {
      fiatTx.value.forEach(tx => {
        const a = tx.attributes || {};
        const type = (a.type || '').toUpperCase();
        const amount = parseFloat(a.amount || 0);
        if (type === 'DEPOSIT' || type === 'FIAT_DEPOSIT') {
          capitaleVersato += amount;
          numDepositi++;
        }
      });
    }

    // Acquisti e vendite
    if (trades.status === 'fulfilled') {
      trades.value.forEach(t => {
        const a = t.attributes || {};
        const type = (a.type || '').toUpperCase();
        const amount = parseFloat(a.amount_fiat || a.price || 0);
        if (type === 'BUY') totalAcquisti += amount;
        else if (type === 'SELL') totalVendite += amount;
      });
    }

    res.json({
      capitaleVersato: parseFloat(capitaleVersato.toFixed(2)),
      numDepositi,
      totalAcquisti: parseFloat(totalAcquisti.toFixed(2)),
      totalVendite: parseFloat(totalVendite.toFixed(2)),
      reward: parseFloat(reward.toFixed(2)),
      fiatTxCount: fiatTx.status === 'fulfilled' ? fiatTx.value.length : 0,
      tradesCount: trades.status === 'fulfilled' ? trades.value.length : 0,
      fiatTxError: fiatTx.status === 'rejected' ? fiatTx.reason?.body : null,
      tradesError: trades.status === 'rejected' ? trades.reason?.body : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/debug', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key mancante' });
  try {
    const assetWallets = await bpFetch(BASE_V1 + '/asset-wallets', apiKey);
    const attrs = assetWallets?.data?.attributes || {};
    // Mostra prime 2 voci per ogni categoria
    const sample = {};
    for (const key of Object.keys(attrs)) {
      const arr = attrs[key] || [];
      sample[key] = arr.slice(0, 2).map(w => w.attributes || w);
    }
    res.json({ keys: Object.keys(attrs), sample });
  } catch (e) {
    res.status(e.status || 500).json(e.body || { error: String(e) });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy attivo su porta ${PORT}`));
