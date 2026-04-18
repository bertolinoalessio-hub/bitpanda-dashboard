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

// Recupera tutte le pagine di un endpoint paginato
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
    if (page > 50) break; // safety limit
  }
  return all;
}

// Endpoint aggregato portafoglio completo
app.get('/portfolio', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key mancante' });
  try {
    const [assetWallets, fiatWallets, ticker, securitiesWallets, commodityWallets] = await Promise.allSettled([
      bpFetch(BASE_V1 + '/asset-wallets', apiKey),
      bpFetch(BASE_V1 + '/fiatwallets', apiKey),
      bpFetch(BASE_V1 + '/ticker', apiKey),
      bpFetch(BASE_V1 + '/securities/wallets', apiKey),
      bpFetch(BASE_V1 + '/commodities/wallets', apiKey),
    ]);
    res.json({
      assetWallets: assetWallets.status === 'fulfilled' ? assetWallets.value : null,
      fiatWallets: fiatWallets.status === 'fulfilled' ? fiatWallets.value : null,
      ticker: ticker.status === 'fulfilled' ? ticker.value : null,
      securitiesWallets: securitiesWallets.status === 'fulfilled' ? securitiesWallets.value : null,
      commodityWallets: commodityWallets.status === 'fulfilled' ? commodityWallets.value : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Endpoint transazioni — recupera tutto e calcola il riepilogo
app.get('/summary', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key mancante' });
  try {
    const transactions = await bpFetchAll('/transactions', apiKey);

    let capitaleVersato = 0;
    let numDepositi = 0;
    let totalAcquisti = 0;
    let totalVendite = 0;
    let reward = 0;

    transactions.forEach(tx => {
      const a = tx.attributes || {};
      const type = (a.type || a.transaction_type || '').toUpperCase();
      const amount = parseFloat(a.amount_eur || a.amount || 0);

      if (['DEPOSIT', 'FIAT_DEPOSIT', 'SEPA', 'CARD'].some(t => type.includes(t))) {
        capitaleVersato += amount;
        numDepositi++;
      } else if (['BUY', 'TRADE', 'SAVINGS_PLAN'].some(t => type.includes(t))) {
        totalAcquisti += amount;
      } else if (['SELL'].some(t => type.includes(t))) {
        totalVendite += amount;
      } else if (['REWARD', 'CASHBACK', 'BONUS', 'INTEREST'].some(t => type.includes(t))) {
        reward += amount;
      }
    });

    res.json({
      capitaleVersato: parseFloat(capitaleVersato.toFixed(2)),
      numDepositi,
      totalAcquisti: parseFloat(totalAcquisti.toFixed(2)),
      totalVendite: parseFloat(totalVendite.toFixed(2)),
      reward: parseFloat(reward.toFixed(2)),
      totalTransactions: transactions.length
    });
  } catch (e) {
    res.status(e.status || 500).json(e.body || { error: String(e) });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy attivo su porta ${PORT}`));
