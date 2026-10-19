/* Hitung statistik house dari semua token. Dipisah supaya mudah dites.
   Catatan: change = perubahan saldo PEMAIN. Untung house = -change. */
const NON_GAME = new Set(["deposit", "withdraw", "admin_add", "admin_sub", "bonus"]);

export function wibDay(ms) {
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function blank() { return { plays: 0, wagered: 0, playerNet: 0, wins: 0, losses: 0, even: 0 }; }
function add(b, h) {
  b.plays++;
  b.wagered += h.bet || 0;
  b.playerNet += h.change || 0;
  if (h.change > 0) b.wins++; else if (h.change < 0) b.losses++; else b.even++;
}
function finish(b) {
  return {
    ...b,
    houseProfit: -b.playerNet,
    rtp: b.wagered ? Math.round(((b.wagered + b.playerNet) / b.wagered) * 1000) / 10 : null,
  };
}

export function computeStats(tokens, now = Date.now()) {
  const today = wibDay(now);
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(wibDay(now - i * 86400000));

  const total = blank(), todayB = blank();
  const perGame = {}, perGameToday = {}, perDay = {};
  days.forEach(d => (perDay[d] = blank()));
  let balanceSum = 0, premium = 0;
  const players = [];

  for (const t of tokens || []) {
    balanceSum += t.balance || 0;
    if (t.isPremium) premium++;
    let net = 0, plays = 0;
    for (const h of t.history || []) {
      if (!h || NON_GAME.has(h.game) || typeof h.at !== "number") continue;
      add(total, h);
      (perGame[h.game] || (perGame[h.game] = blank()));
      add(perGame[h.game], h);
      net += h.change || 0; plays++;
      const d = wibDay(h.at);
      if (d === today) {
        add(todayB, h);
        add(perGameToday[h.game] || (perGameToday[h.game] = blank()), h);
      }
      if (perDay[d]) add(perDay[d], h);
    }
    if (plays) players.push({ token: t.token, plays, net, premium: !!t.isPremium });
  }

  const mask = s => (s && s.length > 6 ? s.slice(0, 4) + "••••" + s.slice(-2) : s);
  const top = players.sort((a, b) => b.net - a.net).slice(0, 10).map(p => ({ ...p, token: mask(p.token) }));

  const fin = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, finish(v)]));
  return {
    generatedAt: now,
    tokens: { total: (tokens || []).length, premium, balanceSum },
    total: finish(total),
    today: finish(todayB),
    perGame: fin(perGame),
    perGameToday: fin(perGameToday),
    perDay: days.map(d => ({ date: d, ...finish(perDay[d]) })),
    topWinners: top,
  };
}
