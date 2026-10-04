// ==UserScript==
// @name         Goodreads → OBA Amsterdam (English edition)
// @namespace    https://zoeken.oba.nl/
// @version      2.0.1
// @description  Shows whether the OBA (Openbare Bibliotheek Amsterdam) has the Goodreads book you're viewing in English — on loan or reserved still counts.
// @match        https://www.goodreads.com/book/show/*
// @match        https://www.goodreads.com/*/book/show/*
// @match        https://goodreads.com/book/show/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      zoeken.oba.nl
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  console.log('[OBA userscript] loaded on', location.href); // visible in DevTools (F12 → Console) if Tampermonkey runs it

  const OBA = 'https://zoeken.oba.nl';
  const WANT_LANG = 'Engels';           // OBA's label for English
  const PANEL_ID = 'oba-avail-panel';
  const LANG_EN = { Engels: 'English', Nederlands: 'Dutch', Duits: 'German', Frans: 'French', Spaans: 'Spanish', Italiaans: 'Italian', Portugees: 'Portuguese', Turks: 'Turkish', Arabisch: 'Arabic', Pools: 'Polish' };

  // ---------- helpers ----------

  function get(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload: r => (r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status))),
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
        timeout: 20000,
      });
    });
  }

  const parse = html => new DOMParser().parseFromString(html, 'text/html');
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const visibleText = el => { const c = el.cloneNode(true); c.querySelectorAll('.hidden-text').forEach(h => h.remove()); return c.textContent.trim(); };
  const absUrl = href => new URL(href, OBA).href.replace(/^http:/, 'https:');

  // ---------- Goodreads side ----------

  function readBook() {
    let ld = {};
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { const j = JSON.parse(s.textContent); if (j['@type'] === 'Book') { ld = j; break; } } catch (_) { /* ignore */ }
    }
    const rawTitle = document.querySelector('h1[data-testid="bookTitle"]')?.textContent || ld.name || '';
    const title = rawTitle.replace(/\s*\([^)]*#\d[^)]*\)\s*$/, '').split(':')[0].trim(); // drop "(Series, #1)" and subtitle
    const author = (Array.isArray(ld.author) ? ld.author[0]?.name : ld.author?.name)
      || document.querySelector('.ContributorLink__name')?.textContent || '';
    const isbn = (ld.isbn || '').replace(/[^0-9Xx]/g, '');
    return { title, author: author.trim(), isbn };
  }

  // ---------- OBA side ----------

  // OBA folds all language editions of a title into one result: the record's own language plus
  // "Ga naar <language>" links to the other editions. Collect every edition with its link.
  async function search(q) {
    const doc = parse(await get(`${OBA}/?q=${encodeURIComponent(q)}`));
    return [...doc.querySelectorAll('article.record[data-id*="catalogus"]')].map(a => {
      const link = a.querySelector('.content a.detaillink, a.detaillink');
      const editions = [{
        lang: a.querySelector('.short-details-language')?.textContent.trim() || '',
        url: link ? absUrl(link.getAttribute('href')) : '',
      }];
      for (const l of a.querySelectorAll('.undup-language-link')) editions.push({ lang: visibleText(l), url: absUrl(l.getAttribute('href')) });
      return {
        title: a.querySelector('h2.heading')?.textContent.trim() || '',
        authors: [...a.querySelectorAll('.core-author')].map(e => e.textContent.trim()).join(', '),
        material: a.querySelector('.material-text')?.textContent.trim() || '',
        editions,
      };
    }).filter(r => /^boek$/i.test(r.material)); // physical books only (no DVDs, audio CDs, etc.)
  }

  // 0 = exact title, 1 = title prefix, 2 = title contained, -1 = no match (author surname must also match)
  function matchRank(rec, book) {
    const t = norm(book.title), rt = norm(rec.title);
    const surname = norm(book.author).split(' ').pop();
    if (!t || (surname && !norm(rec.authors).includes(surname))) return -1;
    if (rt === t) return 0;
    if (rt.startsWith(t + ' ')) return 1;
    if (rt.includes(t)) return 2;
    return -1;
  }

  async function lookup(book) {
    // 1) exact edition by ISBN, 2) title + author (finds other English editions, e.g. UK vs US)
    let records = [];
    let query = '';
    if (book.isbn) {
      query = book.isbn;
      records = await search(book.isbn);
    }
    if (!records.some(r => r.editions.some(e => e.lang === WANT_LANG))) {
      query = `${book.title} ${book.author}`.trim();
      const ranked = (await search(query)).map(r => ({ r, rank: matchRank(r, book) })).filter(x => x.rank >= 0);
      const best = Math.min(...ranked.map(x => x.rank));
      records = ranked.filter(x => x.rank === best).map(x => x.r); // keep only the closest title tier
    }
    const editions = records.flatMap(r => r.editions.map(e => ({ ...e, title: r.title })));
    return {
      query,
      english: editions.filter(e => e.lang === WANT_LANG),
      otherLangs: [...new Set(editions.map(e => e.lang).filter(l => l && l !== WANT_LANG))],
    };
  }

  // ---------- UI ----------

  GM_addStyle(`
    #${PANEL_ID}{margin:16px 0;padding:10px 14px;border:1px solid #d8d8d8;border-radius:8px;font:14px/1.4 system-ui,sans-serif;background:#fafaf7;color:#1e1915}
    #${PANEL_ID} .row{display:flex;gap:8px;align-items:center;font-weight:600}
    #${PANEL_ID} .dot{width:10px;height:10px;border-radius:50%;flex:none}
    #${PANEL_ID} .ok{background:#2e8540} #${PANEL_ID} .no{background:#b33} #${PANEL_ID} .wait{background:#999}
    #${PANEL_ID} a{color:#00635d}
    #${PANEL_ID} .muted{color:#6b6b6b;font-size:12px;margin-top:2px}
  `);

  function panel() {
    let p = document.getElementById(PANEL_ID);
    if (!p) {
      p = document.createElement('div');
      p.id = PANEL_ID;
      // Goodreads renders .BookActions twice (desktop sidebar + mobile column); use the visible one
      const anchor = [...document.querySelectorAll('.BookActions')].find(e => e.offsetParent !== null)
        || document.querySelector('.BookActions') || document.querySelector('h1');
      (anchor?.parentNode || document.body).insertBefore(p, anchor ? anchor.nextSibling : null);
    }
    return p;
  }

  function render(result) {
    const searchUrl = `${OBA}/?q=${encodeURIComponent(result.query)}`;
    const others = result.otherLangs.map(l => LANG_EN[l] || l).join(', ');
    if (result.english.length) {
      const first = result.english[0];
      panel().innerHTML = `<div class="row"><span class="dot ok"></span>OBA has it in English —&nbsp;<a href="${esc(first.url)}" target="_blank" rel="noopener">view / reserve</a></div>
        ${result.english.length > 1 ? `<div class="muted">${result.english.length} English editions · <a href="${searchUrl}" target="_blank" rel="noopener">see all</a></div>` : ''}`;
    } else {
      panel().innerHTML = `<div class="row"><span class="dot no"></span>Not at OBA in English</div>
        <div class="muted">${others ? `Available in: ${esc(others)} · ` : ''}<a href="${searchUrl}" target="_blank" rel="noopener">search OBA</a></div>`;
    }
  }

  // ---------- main ----------

  let lastKey = '';
  async function run() {
    const book = readBook();
    if (!book.title) return;
    const key = location.pathname + '|' + book.isbn + '|' + book.title;
    if (key === lastKey) return;
    lastKey = key;

    panel().innerHTML = `<div class="row"><span class="dot wait"></span>Checking OBA Amsterdam…</div>`;
    try {
      const result = await lookup(book);
      if (key === lastKey) render(result);
    } catch (e) {
      panel().innerHTML = `<div class="row"><span class="dot no"></span>OBA check failed</div><div class="muted">${esc(e.message)}</div>`;
    }
  }

  // Goodreads is a single-page app: re-run when the book changes without a full reload.
  run();
  new MutationObserver(() => {
    if (document.querySelector('h1[data-testid="bookTitle"]')) {
      if (!document.getElementById(PANEL_ID)) lastKey = '';
      run();
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
