/* Ikon SVG custom pengganti emoji. Teks asli tetap ada di DOM (tersembunyi),
   jadi logika JS yang membaca textContent tidak terganggu. */
(function () {
  const L = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const dot = (c, s) => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="${c}" stroke="${s || 'rgba(0,0,0,.35)'}" stroke-width="1.5"/><circle cx="9" cy="9" r="2.4" fill="rgba(255,255,255,.35)"/></svg>`;
  const fruit = (c, leaf) => `<svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="7.5" fill="${c}" stroke="rgba(0,0,0,.3)" stroke-width="1.2"/><path d="M12 7c0-2 1-3.5 3-4-.2 2-1 3.5-3 4z" fill="${leaf || '#4caf50'}"/><circle cx="9" cy="12" r="2" fill="rgba(255,255,255,.35)"/></svg>`;
  const medal = c => `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3l3.5 7 3.5-7" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="15" r="6" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/></svg>`;
  const plane = L('<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>');
  const card = L('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/>');
  const ICONS = {
    '🎰': L('<rect x="3" y="4" width="14" height="16" rx="3"/><path d="M7 9h6M7 13h6"/><path d="M20 9v5"/><circle cx="20" cy="7.5" r="1.4"/>'),
    '🏆': L('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3"/><path d="M12 13v4M8 20h8M9.5 17h5"/>'),
    '💀': L('<path d="M5 12a7 7 0 1 1 14 0v3a2 2 0 0 1-2 2h-1v3H8v-3H7a2 2 0 0 1-2-2z"/><circle cx="9.5" cy="12" r="1.3"/><circle cx="14.5" cy="12" r="1.3"/>'),
    '⚠': L('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
    '🎯': L('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'),
    '🎡': L('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7M12 14v7M3 12h7M14 12h7M5.6 5.6l5 5M13.4 13.4l5 5M18.4 5.6l-5 5M10.6 13.4l-5 5"/>'),
    '🪙': L('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><path d="M12 9.5v5"/>'),
    '🏇': L('<path d="M5 20V10a7 7 0 0 1 14 0v10h-4v-9a3 3 0 0 0-6 0v9z"/>'),
    '💣': L('<circle cx="10" cy="14" r="7"/><path d="M15 8l3-3M17 3l.5 2.5L20 6"/>'),
    '🃏': L('<rect x="5" y="3" width="11" height="16" rx="2"/><path d="M19 7l2 11-9 2"/>'),
    '🔮': L('<circle cx="12" cy="11" r="7"/><path d="M7 20h10M9 17l-1 3M15 17l1 3M9 9a3 3 0 0 1 3-2"/>'),
    '💰': L('<path d="M9 3h6l-1.5 3h-3z"/><path d="M10.5 6C5 9 4 20 12 20s7-11 1.5-14"/><path d="M12 11v5"/>'),
    '💥': L('<path d="M12 2l2 6 6-2-3 5 5 3-6 1 1 6-5-4-5 4 1-6-6-1 5-3-3-5 6 2z"/>'),
    '👑': L('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>'),
    '⚔': L('<path d="M5 19L19 5M14 5h5v5M19 19L5 5M10 5H5v5M8 16l-3 3M16 16l3 3"/>'),
    '✈': plane, '🛫': plane,
    '✅': L('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
    '❌': L('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
    '🔒': L('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    '🏁': L('<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>'),
    '💎': L('<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l-2 6 5 12 5-12-2-6"/>'),
    '🔊': L('<path d="M3 10v4h4l5 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
    '🔇': L('<path d="M3 10v4h4l5 4V6L7 10z"/><path d="M16 9l5 6M21 9l-5 6"/>'),
    '⛔': L('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
    '🎮': L('<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><path d="M15.5 11.5h.01M18 13.5h.01"/>'),
    '🥇': medal('#e6b94a'), '🥈': medal('#b9c0c9'), '🥉': medal('#c1824a'),
    '💸': L('<circle cx="9" cy="14" r="6"/><path d="M15 9l5-5M16 4h4v4"/>'),
    '💳': card,
    '🎲': L('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>'),
    '💾': L('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    '🎉': L('<path d="M4 20l5-13 8 8z"/><path d="M14 4v2M19 8h2M17 11l2-1M10 3l1 2"/>'),
    '🏠': L('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    '📖': L('<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>'),
    '🤝': L('<path d="M3 12l4-4 4 2 4-2 4 4-8 8z"/>'),
    '🟰': L('<path d="M5 9h14M5 15h14"/>'),
    '❔': L('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>'),
    '🔴': dot('#e5484d'), '🟢': dot('#3ecf8e'), '⚫': dot('#22222a', 'rgba(255,255,255,.25)'), '🟣': dot('#8e5be8'),
    '🍇': fruit('#8e4fc2'), '🍉': fruit('#e5484d'), '🍋': fruit('#f2d34a'), '🍌': fruit('#f4d03f', '#8bc34a'),
    '🍎': fruit('#d93a3a'), '🍑': fruit('#f4a27a'), '🍒': fruit('#c4202e'), '🫐': fruit('#4a5bd0'),
    '🥥': fruit('#8a6a4a', '#6d8b3a'), '🥑': fruit('#6a9a3a', '#4a7a2a'),
  };
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
    apply(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  window.Icons = { apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
