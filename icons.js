/* Ikon SVG berwarna (gaya 3D: gradasi + kilau) pengganti emoji.
   Teks emoji asli tetap ada di DOM (tersembunyi) agar logika JS yang membaca textContent aman. */
(function () {
  /* ── Gradasi bersama (sprite tersembunyi) ── */
  const lin = (n, a, b, c) => `<linearGradient id="i-${n}" x1="0" y1="0" x2=".55" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
  const rad = (n, a, b, c) => `<radialGradient id="r-${n}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient>`;
  const DEFS =
    lin('gold', '#fff3b0', '#f4b73a', '#b8741a') + lin('red', '#ff8a85', '#e5383b', '#8f1d22') +
    lin('green', '#86f2b5', '#26b46d', '#0f6b3f') + lin('blue', '#a6dcff', '#3b8ee0', '#1f4f9e') +
    lin('purple', '#d8b8ff', '#8e5be8', '#4b2a96') + lin('silver', '#ffffff', '#c9d1da', '#7d8794') +
    lin('dark', '#5a5a6c', '#2a2a36', '#101018') + lin('brown', '#e8b078', '#a8662f', '#5e3414') +
    lin('orange', '#ffd09a', '#ff8f3a', '#c4501a') + lin('yellow', '#fffbb0', '#f7dc3c', '#c9a213') +
    lin('cyan', '#d6fbff', '#58d0ee', '#1d84b8') +
    rad('red', '#ff9a96', '#e5383b', '#8f1d22') + rad('green', '#9bf5c2', '#26b46d', '#0f6b3f') +
    rad('purple', '#dcc2ff', '#8e5be8', '#4b2a96') + rad('dark', '#6a6a7c', '#2a2a36', '#08080e') +
    rad('gold', '#fff3b0', '#f4b73a', '#a8650f') + rad('blue', '#b4e0ff', '#3b8ee0', '#1f4f9e') +
    rad('yellow', '#fffbb8', '#f7dc3c', '#c49a10') + rad('orange', '#ffd8a6', '#ff8f3a', '#c4501a') +
    rad('brown', '#d8a470', '#8a5226', '#3e200c') + rad('pink', '#ffd0c0', '#ff8f7a', '#d9505a') +
    '<linearGradient id="i-shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>';

  const f = n => `url(#i-${n})`, r = n => `url(#r-${n})`;
  const V = b => `<svg viewBox="0 0 32 32">${b}</svg>`;
  const sh = (x, y, rx, ry, rot = 0) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#i-shine)" transform="rotate(${rot} ${x} ${y})"/>`;
  const st = (c, w) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  const P = (a, rr) => [16 + rr * Math.cos(a), 16 + rr * Math.sin(a)];

  const dot = n => V(`<circle cx="16" cy="16" r="13" fill="${r(n)}"/>${sh(11, 10, 5, 3, -35)}`);
  const medal = g => V(`<path d="M8 2h6l3 10h-6z" fill="${f('red')}"/><path d="M24 2h-6l-3 10h6z" fill="${f('blue')}"/><circle cx="16" cy="20" r="10" fill="${f(g)}"/><circle cx="16" cy="20" r="6.8" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="1.4"/><path d="M16 15.5l1.4 3 3.2.3-2.4 2.1.7 3.1-2.9-1.7-2.9 1.7.7-3.1-2.4-2.1 3.2-.3z" fill="rgba(0,0,0,.28)"/>${sh(12, 14, 5, 3, -30)}`);
  const plane = V(`<path d="M16 2.5c1.5 0 2.2 1.3 2.2 3.2V13l10.3 6.3v3.2L18.2 19.6V25l3.2 2.6V30L16 28.4 10.6 30v-2.4l3.2-2.6v-5.4L3.5 22.5v-3.2L13.8 13V5.7c0-1.9.7-3.2 2.2-3.2z" fill="${f('silver')}"/><ellipse cx="16" cy="8" rx="1.5" ry="2.6" fill="${f('blue')}"/><path d="M4 21l9.8-5.6v2.6zM28 21l-9.8-5.6v2.6z" fill="${f('red')}" opacity=".85"/>`);
  const fruitLeaf = (x, y, rot = -25) => `<path d="M${x} ${y}c0-3 2-5 5-5.5-.2 3-2 5-5 5.5z" fill="${f('green')}" transform="rotate(${rot} ${x} ${y})"/>`;

  /* roda roulette: 12 irisan */
  let wedges = '';
  for (let i = 0; i < 12; i++) {
    const a1 = (i / 12) * Math.PI * 2 - Math.PI / 2, a2 = ((i + 1) / 12) * Math.PI * 2 - Math.PI / 2;
    const [x1, y1] = P(a1, 11), [x2, y2] = P(a2, 11);
    wedges += `<path d="M16 16L${x1} ${y1}A11 11 0 0 1 ${x2} ${y2}z" fill="${i === 0 ? r('green') : i % 2 ? r('red') : r('dark')}"/>`;
  }
  /* ledakan: bintang 12 sudut */
  const star = (R1, R2) => Array.from({ length: 24 }, (_, k) => P((k * Math.PI) / 12 - Math.PI / 2, k % 2 ? R2 : R1).join(',')).join(' ');
  /* bendera kotak-kotak */
  let checks = '';
  for (let rr = 0; rr < 3; rr++) for (let c = 0; c < 4; c++)
    checks += `<rect x="${9 + c * 4.6}" y="${5 + rr * 4.6}" width="4.6" height="4.6" fill="${(rr + c) % 2 ? '#1a1a22' : '#ffffff'}"/>`;

  const ICONS = {
    '🎰': V(`<rect x="4" y="5" width="20" height="23" rx="5" fill="${f('red')}"/><rect x="4" y="5" width="20" height="7" rx="3.5" fill="${f('gold')}"/><rect x="8" y="13" width="12" height="9" rx="2" fill="#fff8e1"/><path d="M9.3 15h2.7l-1.5 5M13 15h2.7l-1.5 5M16.7 15h2.7l-1.5 5" ${st('#d4202a', 1.5)}/><rect x="6.5" y="24" width="15" height="3" rx="1.5" fill="${f('gold')}"/><path d="M26.5 12v7" ${st('#b8741a', 2.4)}/><circle cx="26.5" cy="9.8" r="2.8" fill="${r('red')}"/>${sh(11, 9, 6, 3.5)}`),
    '🏆': V(`<path d="M9 5h14v7a7 7 0 0 1-14 0z" fill="${f('gold')}"/><path d="M9 8H5.5v1.5a4 4 0 0 0 4 4M23 8h3.5v1.5a4 4 0 0 1-4 4" ${st('#e0a02a', 2.2)}/><rect x="14.4" y="19" width="3.2" height="4.5" fill="#c98a1e"/><rect x="9.5" y="23" width="13" height="4.5" rx="1.8" fill="${f('gold')}"/>${sh(13, 10, 2.6, 3.8, 6)}`),
    '💀': V(`<path d="M5.5 14a10.5 10.5 0 0 1 21 0v4.5a3 3 0 0 1-3 3H22v4.5H10v-4.5H8.5a3 3 0 0 1-3-3z" fill="${f('silver')}"/><ellipse cx="11.3" cy="15.3" rx="3.2" ry="3.6" fill="#16161e"/><ellipse cx="20.7" cy="15.3" rx="3.2" ry="3.6" fill="#16161e"/><path d="M16 19.5l-1.8 3.2h3.6z" fill="#16161e"/><path d="M13 26v-4M16 26v-3M19 26v-4" ${st('#7d8794', 1.3)}/>${sh(12, 8, 5, 3, -20)}`),
    '⚠': V(`<path d="M16 4L29.5 27.5h-27z" fill="${f('gold')}" stroke="#c98a1e" stroke-width="1.6" stroke-linejoin="round"/><rect x="14.6" y="12" width="2.8" height="8" rx="1.4" fill="#2a2a36"/><circle cx="16" cy="23.2" r="1.7" fill="#2a2a36"/>${sh(13.2, 17, 1.8, 3.4, 12)}`),
    '🎯': V(`<circle cx="16" cy="16" r="13" fill="${f('red')}"/><circle cx="16" cy="16" r="9.3" fill="#fff"/><circle cx="16" cy="16" r="6" fill="${f('red')}"/><circle cx="16" cy="16" r="2.6" fill="${r('gold')}"/>${sh(11, 8, 6, 3, -30)}`),
    '🎡': V(`<circle cx="16" cy="16" r="14" fill="${f('gold')}"/><circle cx="16" cy="16" r="12" fill="#2a2a36"/>${wedges}<circle cx="16" cy="16" r="3.4" fill="${r('gold')}"/><circle cx="16" cy="6.2" r="1.7" fill="#fff"/>${sh(11, 6, 6, 2.6, -30)}`),
    '🪙': V(`<circle cx="16" cy="16" r="13.5" fill="${r('gold')}"/><circle cx="16" cy="16" r="10" fill="none" stroke="#b8741a" stroke-width="1.6"/><path d="M16 9.5l1.9 4.2 4.4.4-3.3 3 1 4.4-4-2.4-4 2.4 1-4.4-3.3-3 4.4-.4z" fill="#c98a1e"/>${sh(11, 9, 5.5, 3, -30)}`),
    '🏇': V(`<path d="M7 28V14a9 9 0 0 1 18 0v14h-5.4V14.5a3.6 3.6 0 0 0-7.2 0V28z" fill="${f('gold')}"/><circle cx="9.7" cy="23" r="1.2" fill="#8a5a12"/><circle cx="9.7" cy="18" r="1.2" fill="#8a5a12"/><circle cx="22.3" cy="23" r="1.2" fill="#8a5a12"/><circle cx="22.3" cy="18" r="1.2" fill="#8a5a12"/><path d="M9.8 25V15a6.2 6.2 0 0 1 3.6-5.6" ${st('rgba(255,255,255,.6)', 1.5)}/>`),
    '💣': V(`<circle cx="14" cy="19" r="10.5" fill="${r('dark')}"/><rect x="17" y="6.5" width="6" height="4" rx="1.2" fill="${f('silver')}" transform="rotate(-40 20 8.5)"/><path d="M21 8.5c2.5-2.5 4-2 5-3.5" ${st('#a8662f', 2)}/><polygon points="26,2 27.2,4.6 30,5 28,6.8 28.5,9.6 26,8.2 23.5,9.6 24,6.8 22,5 24.8,4.6" fill="${f('yellow')}"/>${sh(10, 13, 5, 3, -35)}`),
    '🃏': V(`<rect x="4" y="5" width="16" height="22" rx="3.2" fill="${f('blue')}" transform="rotate(-12 12 16)"/><rect x="11" y="5" width="16" height="22" rx="3.2" fill="#fff" stroke="#c9d1da" stroke-width="1" transform="rotate(8 19 16)"/><path d="M19.3 11.5l4 5-4 5-4-5z" fill="${f('red')}" transform="rotate(8 19 16)"/>`),
    '🔮': V(`<path d="M8 28.5c1-4.5 3.4-6 8-6s7 1.5 8 6z" fill="${f('gold')}"/><circle cx="16" cy="14.5" r="11.5" fill="${r('purple')}"/><path d="M19 8l1 2.3 2.3 1-2.3 1-1 2.3-1-2.3-2.3-1 2.3-1z" fill="#fff" opacity=".9"/>${sh(11, 8.5, 5.5, 3.2, -35)}`),
    '💰': V(`<path d="M12 3.5h8l-2.2 4.5h-3.6z" fill="${f('brown')}"/><path d="M13 8C5 13.5 3 28.5 16 28.5S27 13.5 19 8z" fill="${f('orange')}"/><rect x="11.5" y="6.8" width="9" height="2.8" rx="1.4" fill="${f('red')}"/><circle cx="16" cy="19.5" r="5.2" fill="${r('gold')}"/><path d="M16 16.5v6" ${st('#a8650f', 1.6)}/>${sh(11, 16, 3, 6, 20)}`),
    '💥': V(`<polygon points="${star(14.5, 8)}" fill="${f('orange')}"/><polygon points="${star(10, 5.5)}" fill="${f('yellow')}"/>${sh(13, 11, 4, 2.4, -30)}`),
    '👑': V(`<path d="M3.5 11l6.5 6 6-9 6 9 6.5-6-3 15.5H6.5z" fill="${f('gold')}"/><rect x="6.5" y="24" width="19" height="3.5" rx="1.7" fill="#c98a1e"/><circle cx="3.5" cy="10.5" r="2" fill="${r('red')}"/><circle cx="16" cy="7.5" r="2.2" fill="${r('red')}"/><circle cx="28.5" cy="10.5" r="2" fill="${r('red')}"/>${sh(12, 15, 4, 6, 10)}`),
    '⚔': V(`<path d="M7 25L25 7M25 25L7 7" ${st(f('silver'), 3.6)}/><path d="M6.6 20.6l4.8 4.8M25.4 20.6l-4.8 4.8" ${st('#e0a02a', 2.8)}/><circle cx="5.5" cy="26.5" r="2.3" fill="${r('gold')}"/><circle cx="26.5" cy="26.5" r="2.3" fill="${r('gold')}"/>`),
    '✈': plane, '🛫': plane,
    '✅': V(`<circle cx="16" cy="16" r="13.5" fill="${f('green')}"/><path d="M9.5 16.5l4.5 4.5 8.5-9.5" ${st('#fff', 3.6)}/>${sh(11, 9, 6, 3, -30)}`),
    '❌': V(`<circle cx="16" cy="16" r="13.5" fill="${f('red')}"/><path d="M10.5 10.5l11 11M21.5 10.5l-11 11" ${st('#fff', 3.6)}/>${sh(11, 9, 6, 3, -30)}`),
    '🔒': V(`<path d="M9.5 14V10a6.5 6.5 0 0 1 13 0v4" ${st(f('silver'), 3.2)}/><rect x="5.5" y="13" width="21" height="15" rx="4.2" fill="${f('gold')}"/><circle cx="16" cy="19.6" r="2.4" fill="#6a420c"/><rect x="15" y="20.5" width="2" height="4" rx="1" fill="#6a420c"/>${sh(11, 16, 4.5, 2.4, -10)}`),
    '🏁': V(`<rect x="6" y="3.5" width="2.6" height="25" rx="1.3" fill="${f('silver')}"/>${checks}<rect x="9" y="5" width="18.4" height="13.8" fill="none" stroke="#1a1a22" stroke-width=".8"/>`),
    '💎': V(`<path d="M9 5h14l6.5 7h-27z" fill="${f('cyan')}"/><path d="M2.5 12h27L16 28.5z" fill="${f('blue')}"/><path d="M9 5l-2.2 7L16 28.5M23 5l2.2 7L16 28.5M2.5 12h27" ${st('rgba(255,255,255,.55)', .9)}/>${sh(11, 8, 4, 2, -10)}`),
    '🔊': V(`<path d="M3.5 12h5.5l7.5-6.5v21L9 20H3.5z" fill="${f('silver')}"/><path d="M20 11a7 7 0 0 1 0 10M23.5 7a12 12 0 0 1 0 18" ${st(f('gold'), 2.6)}/>`),
    '🔇': V(`<path d="M3.5 12h5.5l7.5-6.5v21L9 20H3.5z" fill="${f('silver')}"/><path d="M21 12l7 8M28 12l-7 8" ${st(f('red'), 2.8)}/>`),
    '⛔': V(`<circle cx="16" cy="16" r="13.5" fill="${f('red')}"/><rect x="7" y="13.2" width="18" height="5.6" rx="2.8" fill="#fff"/>${sh(11, 8, 6, 3, -30)}`),
    '🎮': V(`<path d="M8 9.5h16a5.5 5.5 0 0 1 5.4 6.2l-1.1 7.2a3.9 3.9 0 0 1-6.9 1.7L19 21.5h-6l-2.4 3.1a3.9 3.9 0 0 1-6.9-1.7L2.6 15.7A5.5 5.5 0 0 1 8 9.5z" fill="${f('blue')}"/><path d="M10 13v6M7 16h6" ${st('#fff', 2.2)}/><circle cx="21" cy="14.8" r="1.7" fill="${r('red')}"/><circle cx="24.4" cy="17.6" r="1.7" fill="${r('green')}"/>${sh(13, 11.5, 7, 2.4)}`),
    '🥇': medal('gold'), '🥈': medal('silver'), '🥉': medal('brown'),
    '💸': V(`<rect x="3" y="9" width="26" height="15" rx="3.2" fill="${f('green')}" transform="rotate(-8 16 16)"/><circle cx="16" cy="16.5" r="4.6" fill="${r('gold')}" transform="rotate(-8 16 16)"/><path d="M16 14v5" ${st('#a8650f', 1.5)} transform="rotate(-8 16 16)"/>`),
    '💳': V(`<rect x="2.5" y="6.5" width="27" height="19" rx="3.6" fill="${f('blue')}"/><rect x="2.5" y="11" width="27" height="4.4" fill="#16161e"/><rect x="6" y="18.5" width="7" height="4.4" rx="1.2" fill="${f('gold')}"/>${sh(11, 9, 6, 2.2)}`),
    '🎲': V(`<rect x="3.5" y="3.5" width="25" height="25" rx="6.5" fill="${f('red')}"/><circle cx="10.5" cy="10.5" r="2.1" fill="#fff"/><circle cx="21.5" cy="10.5" r="2.1" fill="#fff"/><circle cx="16" cy="16" r="2.1" fill="#fff"/><circle cx="10.5" cy="21.5" r="2.1" fill="#fff"/><circle cx="21.5" cy="21.5" r="2.1" fill="#fff"/>${sh(12, 7.5, 7, 3)}`),
    '💾': V(`<path d="M4.5 3.5h19.5l4 4v21h-23.5z" fill="${f('blue')}"/><rect x="8.5" y="3.5" width="14" height="9" rx="1.2" fill="#fff"/><rect x="10.5" y="17" width="11" height="11.5" rx="1.6" fill="${f('silver')}"/><rect x="17" y="19" width="2.4" height="5.5" rx="1" fill="#5a6270"/>`),
    '🎉': V(`<path d="M3.5 28.5L10.5 9.5l12 12z" fill="${f('gold')}"/><path d="M7 20l5 5M9.5 14l8 8" ${st('#e0842a', 1.6)}/><circle cx="20" cy="7" r="1.8" fill="${f('red')}"/><circle cx="26" cy="13" r="1.8" fill="${f('blue')}"/><circle cx="14" cy="4.5" r="1.6" fill="${f('green')}"/><rect x="24" y="5" width="3.6" height="1.8" rx=".9" fill="${f('purple')}" transform="rotate(35 25.8 5.9)"/><rect x="19" y="14" width="3.6" height="1.8" rx=".9" fill="${f('orange')}" transform="rotate(-30 20.8 14.9)"/><path d="M14 11c3-1 5-3.5 5-6" ${st('#ff8fc0', 1.6)}/>`),
    '🏠': V(`<rect x="6.5" y="14" width="19" height="14.5" rx="1.5" fill="${f('yellow')}"/><path d="M2.5 15.5L16 3.5l13.5 12z" fill="${f('red')}"/><rect x="13" y="19.5" width="6" height="9" rx="1.6" fill="${f('brown')}"/><rect x="8.6" y="17.5" width="3.6" height="3.6" rx=".8" fill="${f('cyan')}"/><rect x="19.8" y="17.5" width="3.6" height="3.6" rx=".8" fill="${f('cyan')}"/>${sh(12, 8, 6, 2.2, -28)}`),
    '📖': V(`<path d="M3 6.5h11.5a2.5 2.5 0 0 1 2.5 2.5v19a2.5 2.5 0 0 0-2.5-2.5H3z" fill="${f('blue')}"/><path d="M29 6.5H17.5A2.5 2.5 0 0 0 15 9v19a2.5 2.5 0 0 1 2.5-2.5H29z" fill="${f('silver')}"/><path d="M19 11.5h7M19 15.5h7M19 19.5h5" ${st('#7d8794', 1.4)}/>`),
    '🤝': V(`<rect x="1" y="11" width="7.5" height="13" rx="2.2" fill="${f('blue')}"/><rect x="23.5" y="11" width="7.5" height="13" rx="2.2" fill="${f('green')}"/><path d="M8.5 13l6-2.4 4.8 2.4 4.7 1v7.5l-6.2 4-6-2.2-3.3-3z" fill="${f('orange')}"/><path d="M14 14.5l4 3.5M17 12.5l4.5 3.8" ${st('#c4501a', 1.4)}/>`),
    '🟰': V(`<rect x="4.5" y="8.5" width="23" height="5.6" rx="2.8" fill="${f('gold')}"/><rect x="4.5" y="17.9" width="23" height="5.6" rx="2.8" fill="${f('gold')}"/>`),
    '❔': V(`<circle cx="16" cy="16" r="13.5" fill="${f('blue')}"/><path d="M12 12.5a4.1 4.1 0 1 1 5.9 3.6c-1.3.7-1.9 1.5-1.9 3" ${st('#fff', 3.2)}/><circle cx="16" cy="24" r="1.9" fill="#fff"/>${sh(11, 8.5, 6, 3, -30)}`),
    '🔴': dot('red'), '🟢': dot('green'), '⚫': dot('dark'), '🟣': dot('purple'),
    '🍇': V(`<path d="M16 8c0-2.5 1.5-4 4.5-4.5" ${st('#6d4a2a', 1.8)}/>${fruitLeaf(16, 6, 10)}` + [[10, 12], [16, 12], [22, 12], [13, 18], [19, 18], [16, 24]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.4" fill="${r('purple')}"/>`).join('') + sh(9, 10.5, 2, 1.2, -30)),
    '🍉': V(`<path d="M3 11h26a13 13 0 0 1-26 0z" fill="${f('green')}"/><path d="M5.2 11h21.6a10.8 10.8 0 0 1-21.6 0z" fill="#f0f7e0"/><path d="M7 11h18a9 9 0 0 1-18 0z" fill="${f('red')}"/><ellipse cx="12" cy="15" rx=".9" ry="1.5" fill="#2a1a1a"/><ellipse cx="16" cy="18" rx=".9" ry="1.5" fill="#2a1a1a"/><ellipse cx="20" cy="15" rx=".9" ry="1.5" fill="#2a1a1a"/>`),
    '🍋': V(`<path d="M3 16c0-1.2.8-2 2-2l2.4-.5c2-4.6 6-7 9.6-7s7.6 2.4 9.6 7l2.4.5c1.2 0 2 .8 2 2s-.8 2-2 2l-2.4.5c-2 4.6-6 7-9.6 7s-7.6-2.4-9.6-7L5 18c-1.2 0-2-.8-2-2z" fill="${f('yellow')}"/>${sh(13, 11, 6, 2.6, -15)}`),
    '🍌': V(`<path d="M7 7C6 19 14 27 27 22" ${st('#b8892a', 8.4)}/><path d="M7 7C6 19 14 27 27 22" ${st(f('yellow'), 7)}/><path d="M6.6 5.6l1.6-2.6" ${st('#6d4a2a', 2.6)}/>${sh(11, 13, 1.6, 6, 20)}`),
    '🍎': V(`<path d="M16 9.5c-3-2.2-10-1.2-10 6.8 0 7 5 12.2 8 12.2 1 0 1.5-.6 2-.6s1 .6 2 .6c3 0 8-5.2 8-12.2 0-8-7-9-10-6.8z" fill="${r('red')}"/><path d="M16 9.5c0-2 .8-4 2.4-5" ${st('#6d4a2a', 1.8)}/>${fruitLeaf(18, 6.5, -10)}${sh(10, 14, 2.2, 3.4, 20)}`),
    '🍑': V(`<path d="M16 9c-4-2-10.5.5-10.5 8.5C5.5 23 10 28.5 16 28.5s10.5-5.500 10.5-11C26.500 9.500 20 7 16 9z" fill="${r('pink')}"/><path d="M16 9.5c.5 5 .5 12 0 19" ${st('rgba(180,60,70,.35)', 1.3)}/><path d="M16 9c0-2 .8-3.500 2.200-4.500" ${st('#6d4a2a', 1.7)}/>${fruitLeaf(18, 6.5, -5)}${sh(10, 14, 2.2, 3.4, 20)}`),
    '🍒': V(`<path d="M10 20c1-8 4-13 9-15M22 21c-1-8-2-12-3-16" ${st('#4a8a3a', 1.7)}/>${fruitLeaf(19, 5, 10)}<circle cx="10" cy="23" r="6" fill="${r('red')}"/><circle cx="22" cy="24" r="6" fill="${r('red')}"/>${sh(8, 20.5, 2, 1.4, -30)}${sh(20, 21.5, 2, 1.4, -30)}`),
    '🫐': V(`<circle cx="16" cy="17" r="12" fill="${r('blue')}"/><path d="M16 9.5l1.8 2.4 2.8-.6-1.2 2.6 1.6 2.4-2.9.2L16 18.800l-2.100-2.300-2.900-.2 1.600-2.400-1.200-2.600 2.800.6z" fill="#1f3a7a" opacity=".85"/>${sh(10.5, 11, 4, 2.6, -35)}`),
    '🥥': V(`<circle cx="16" cy="16" r="13" fill="${r('brown')}"/><circle cx="12" cy="14" r="1.6" fill="#1a0e06"/><circle cx="20" cy="14" r="1.6" fill="#1a0e06"/><circle cx="16" cy="19.500" r="1.6" fill="#1a0e06"/>${sh(10.5, 8.5, 5, 2.8, -30)}`),
    '🥑': V(`<path d="M16 2.500c-4.500 0-6.500 6-6.500 11 0 6-5 8-5 12 0 3.500 3.500 4.500 11.500 4.500s11.500-1 11.500-4.500c0-4-5-6-5-12 0-5-2-11-6.500-11z" fill="${f('green')}"/><path d="M16 7c-3 0-4.500 4.500-4.500 8 0 5-3.500 6.500-3.500 9.500 0 2.200 2.500 2.800 8 2.800s8-.6 8-2.800c0-3-3.500-4.500-3.500-9.500 0-3.500-1.500-8-4.500-8z" fill="${f('yellow')}"/><circle cx="16" cy="21" r="4.800" fill="${r('brown')}"/>${sh(14.500, 19, 1.800, 1.200, -30)}`),
  };

  /* CSS ikon (disuntik dari sini supaya tidak perlu ubah style.css) */
  const css = document.createElement('style');
  css.textContent = `
  .ico{display:inline-flex;align-items:center;justify-content:center;vertical-align:-0.22em;line-height:1}
  .ico-t{font-size:0;width:0;height:0;overflow:hidden;display:inline-block}
  .ico svg{width:1.25em;height:1.25em;display:block;overflow:visible;filter:drop-shadow(0 1.5px 2px rgba(0,0,0,.45))}
  .logo-wrap .ico svg{width:40px;height:40px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))}
  .token-game-btn .ico svg{width:42px;height:42px}
  .sfx-toggle-btn .ico svg{width:22px;height:22px}
  .result-emoji .ico svg{width:84px;height:84px}`;
  document.head.appendChild(css);

  const keys = Object.keys(ICONS).sort((a, b) => b.length - a.length);
  const RX = new RegExp('(' + keys.join('|') + ')\uFE0F?', 'g');
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CANVAS', 'SVG']);

  function swapNode(node) {
    const txt = node.nodeValue;
    RX.lastIndex = 0;
    if (!RX.test(txt)) return;
    RX.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = RX.exec(txt))) {
      if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
      const s = document.createElement('span');
      s.className = 'ico';
      s.innerHTML = '<span class="ico-t">' + m[0] + '</span>' + ICONS[m[1]];
      frag.appendChild(s);
      last = m.index + m[0].length;
    }
    if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function apply(root) {
    if (!root || (root.closest && root.closest('.ico'))) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        const p = n.parentElement;
        if (!p || SKIP.has(p.tagName.toUpperCase()) || p.closest('.ico')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const list = [];
    while (w.nextNode()) list.push(w.currentNode);
    list.forEach(swapNode);
  }

  let queued = new Set(), raf = 0;
  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') { if (m.target.parentElement) queued.add(m.target.parentElement); }
      else m.addedNodes.forEach(n => queued.add(n.nodeType === 1 ? n : n.parentElement));
    }
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      const q = queued; queued = new Set();
      q.forEach(el => el && el.isConnected && apply(el));
    });
  });

  function start() {
    document.body.insertAdjacentHTML('afterbegin',
      '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + DEFS + '</defs></svg>');
    apply(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  window.Icons = { apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
