/* Shared Says text-first lists: same-origin HTML pagination and inert text links. Detail pages own all platform embeds. */
(() => {
  'use strict';
  const configNode = document.querySelector('#feed-config');
  if (!configNode) return;
  let config;
  try { config = JSON.parse(configNode.textContent); } catch { return; }
  const here = new URL(location.href);
  const canonical = new URL(config.origin);
  if (!/^\/[a-z0-9-]+\/$/.test(config.base || '') || canonical.protocol !== 'https:' ||
      canonical.pathname.replace(/\/$/, '') + '/' !== config.base || canonical.search || canonical.hash) return;
  const listTextOnly = config.listTextOnly === true;
  const allowedHosts = {
    x: ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'],
    facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com'],
    threads: ['threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'],
    instagram: ['instagram.com', 'www.instagram.com'],
    truth: ['truthsocial.com', 'www.truthsocial.com']
  };
  const platformNames = {x: 'X / Twitter', facebook: 'Facebook', threads: 'Threads', instagram: 'Instagram', truth: 'Truth Social'};
  const ownHandles = (Array.isArray(config.xHandles) ? config.xHandles : [config.handle]).filter(v => typeof v === 'string').map(v => v.toLowerCase());
  const latest = document.querySelector('#latest-records');
  const nextLink = document.querySelector('#feed-next');
  const status = document.querySelector('#feed-status');
  const sentinel = document.querySelector('#feed-sentinel');
  const dedupe = !!(document.querySelector('#popular-records') || latest);
  const seen = new Set();
  const registered = new WeakSet();
  const states = new WeakMap();
  const visitedPages = new Set();
  let loading = false, autoBlocked = false;
  let nextURL = null, lastLatestTime = Infinity, lastPage = 1, observer = null, scrollTick = false;
  const create = (tag, className, text) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const say = text => { if (status) status.textContent = text; };
  const utcDate = value => new Date(value).toISOString().slice(0, 10);
  const stamp = row => row.published_at ? Date.parse(row.published_at) : Date.parse(row.published_date + 'T00:00:00Z');
  const displayZone = ['UTC', 'America/New_York', 'Asia/Seoul'].includes(config.displayTimezone) ? config.displayTimezone : 'UTC';
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {timeZone: displayZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset'});
  function displayDate(row) {
    if (!row.published_at) return row.published_date;
    const p = Object.fromEntries(dateFormatter.formatToParts(new Date(row.published_at)).map(part => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day} · ${p.hour}:${p.minute}:${p.second} ${displayZone === 'UTC' ? 'UTC' : p.timeZoneName}`;
  }

  function originalURL(row) {
    const u = new URL(row.original_url);
    if (u.protocol !== 'https:' || !allowedHosts[row.platform]?.includes(u.hostname.toLowerCase()) || u.username || u.password || u.port) throw new Error('Untrusted original URL');
    if (row.platform === 'x') {
      const match = u.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/);
      if (!match || match[2] !== row.post_id || (ownHandles.length && !ownHandles.includes(match[1].toLowerCase()))) throw new Error('Wrong X account or post ID');
    }
    if (row.platform === 'truth') {
      const match = u.pathname.match(/^\/@([A-Za-z0-9_.-]+)\/(?:posts\/)?(\d+)\/?$/);
      if (!match || match[2] !== row.post_id) throw new Error('Wrong Truth Social post ID');
    }
    return u;
  }

  function validateRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,100}$/.test(value.id) || typeof value.post_id !== 'string' || !/^\d+$/.test(value.post_id) ||
        !Object.hasOwn(allowedHosts, value.platform)) throw new Error('Invalid post identity');
    if (value.is_repost === true || ['repost', 'retweet'].includes(value.post_kind) || ['repost', 'retweet'].includes(value.kind)) throw new Error('Repost excluded');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.published_date) || !Number.isFinite(Date.parse(value.published_date + 'T00:00:00Z')) || utcDate(value.published_date + 'T00:00:00Z') !== value.published_date) throw new Error('Invalid post date');
    if (value.published_at != null && (typeof value.published_at !== 'string' || !Number.isFinite(Date.parse(value.published_at)))) throw new Error('Invalid post timestamp');
    if (value.like_count != null && (!Number.isSafeInteger(value.like_count) || value.like_count < 0)) throw new Error('Invalid like count');
    if (value.text != null && (config.allowText !== true || typeof value.text !== 'string' || value.text.length > 500000)) throw new Error('Uncleared or invalid text');
    if (listTextOnly && typeof value.text === 'string' && [...value.text].length > 800) throw new Error('List text exceeds 800 Unicode characters');
    if (value.text_status != null && (typeof value.text_status !== 'string' || value.text_status.length > 100)) throw new Error('Invalid text status');
    if (value.content_status != null && (typeof value.content_status !== 'string' || value.content_status.length > 100)) throw new Error('Invalid content status');
    if (value.text_source != null && (typeof value.text_source !== 'string' && (typeof value.text_source !== 'object' || Array.isArray(value.text_source)))) throw new Error('Invalid text source');
    const textSourceURL = typeof value.text_source === 'string' ? value.text_source : value.text_source?.url;
    if (textSourceURL != null) {
      if (typeof textSourceURL !== 'string') throw new Error('Invalid text source URL');
      const url = new URL(textSourceURL);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('Untrusted text source URL');
    }
    if (value.text_truncated != null && typeof value.text_truncated !== 'boolean') throw new Error('Invalid text truncation flag');
    if (value.truncated != null && typeof value.truncated !== 'boolean') throw new Error('Invalid truncation flag');
    if (value.source_ids != null && (!Array.isArray(value.source_ids) || value.source_ids.length > 128 || value.source_ids.some(id => typeof id !== 'string' || id.length > 500))) throw new Error('Invalid source identifiers');
    const original = originalURL(value);
    const expectedPath = config.base + 'posts/' + value.id.replaceAll(':', '-') + '.html';
    const detail = new URL(value.permalink || expectedPath, canonical.origin);
    if (detail.origin !== canonical.origin || detail.pathname !== expectedPath || detail.search || detail.hash || detail.username || detail.password) throw new Error('Untrusted detail URL');
    return {
      id: value.id, post_id: value.post_id, platform: value.platform, author: typeof value.author === 'string' ? value.author : null,
      original_url: original.href, published_at: value.published_at || null, published_date: value.published_date,
      permalink: detail.pathname, like_count: value.like_count ?? null,
      likes_source: value.likes_source ?? null, likes_captured_at: value.likes_captured_at ?? null,
      text: value.text ?? null, text_status: value.text_status ?? null, text_source: value.text_source ?? null,
      text_truncated: value.text_truncated ?? null, truncated: value.truncated ?? null,
      content_status: value.content_status ?? null, source_ids: value.source_ids ?? null,
      post_kind: value.post_kind || value.kind || null
    };
  }

  function safeFeedURL(value) {
    const u = new URL(value, here.href);
    const path = u.pathname.slice(config.base.length);
    if (u.origin !== here.origin || !u.pathname.startsWith(config.base) || !/^feed\/latest-\d{4,8}\.html$/.test(path) || u.search || u.hash || u.username || u.password) throw new Error('Untrusted feed URL');
    return u;
  }
  function pageNumber(url) { return Number(url.pathname.match(/latest-(\d+)\.html$/)[1]); }

  function parseFeedPage(text, requestedURL) {
    if (typeof text !== 'string' || text.length > 5000000) throw new Error('Invalid feed page');
    const pageURL = safeFeedURL(requestedURL);
    const parsed = new DOMParser().parseFromString(text, 'text/html');
    const canonicalNodes = parsed.querySelectorAll('link[rel="canonical"]');
    if (canonicalNodes.length !== 1) throw new Error('Missing or duplicate feed canonical');
    const expectedCanonical = new URL(pageURL.pathname, canonical.origin).href;
    if (canonicalNodes[0].getAttribute('href') !== expectedCanonical) throw new Error('Feed canonical mismatch');
    const list = parsed.querySelector('[data-feed-items]');
    if (!list) throw new Error('Missing feed items');
    const cards = [...list.children].filter(e => e.classList.contains('feed-record'));
    if (cards.length > 250) throw new Error('Feed page too large');
    const rows = cards.map(card => {
      const data = [...card.querySelectorAll('script.feed-record-data')];
      if (data.length !== 1 || data[0].getAttribute('type') !== 'application/json') throw new Error('Missing inert record data');
      const row = validateRecord(JSON.parse(data[0].textContent));
      if (card.dataset.feedId !== row.id) throw new Error('Record identity mismatch');
      return row;
    });
    let previous = Infinity;
    for (const row of rows) { const time = stamp(row); if (time > previous) throw new Error('Latest page is out of order'); previous = time; }
    const nextNodes = parsed.querySelectorAll('#feed-next');
    if (nextNodes.length > 1) throw new Error('Duplicate next link');
    let next = null;
    const raw = nextNodes[0]?.getAttribute('href');
    if (raw) {
      next = safeFeedURL(raw);
      if (pageNumber(next) !== pageNumber(pageURL) + 1 || visitedPages.has(next.href)) throw new Error('Cyclic or nonsequential pagination');
    }
    return {rows, next: next?.href || null};
  }

  function createCard(value) {
    const row = validateRecord(value);
    const item = create('li', 'feed-record archive-record');
    item.dataset.feedId = row.id; item.dataset.postId = row.id;
    const data = create('script', 'feed-record-data'); data.type = 'application/json'; data.textContent = JSON.stringify(row).replaceAll('<', '\\u003c');
    item.append(recordMeta(row), textLink(row), textNote(row), data);
    return item;
  }

  function recordMeta(row) {
    const meta = create('div', 'feed-meta card-top');
    const date = create('time', '', displayDate(row));
    date.dateTime = row.published_at || row.published_date;
    meta.append(date);
    if (row.like_count !== null) {
      const approximate = row.likes_source && typeof row.likes_source === 'object' && row.likes_source.count_precision === 'display-rounded';
      const likes = create('span', 'feed-likes', (approximate ? '~' : '') + new Intl.NumberFormat('en-US').format(row.like_count) + ' likes');
      likes.title = 'Likes recorded in the source snapshot' + (row.likes_captured_at ? ' · ' + row.likes_captured_at : ''); meta.append(likes);
    } else meta.append(create('span', 'feed-likes', 'Likes unavailable'));
    return meta;
  }

  function textLink(row) {
    const link = create('a', 'feed-text-link detail-link'); link.href = row.permalink;
    const hasText = typeof row.text === 'string' && row.text.trim().length > 0;
    const body = create('p', 'feed-text feed-text-body' + (hasText ? '' : ' feed-text-unavailable'), hasText ? row.text : 'Source text unavailable. Open the post to view the original.');
    body.setAttribute('dir', 'auto');
    link.append(body, create('span', 'feed-read-more', 'View post →'));
    return link;
  }

  function textNote(row) {
    const hasText = typeof row.text === 'string' && row.text.trim().length > 0;
    const status = row.text_status || 'unavailable';
    let message = !hasText ? 'Source text unavailable.' : status.includes('description') ? 'Official original-page description; not a full post transcript.' : status.includes('partial') || status.includes('truncated') ? 'Partial source text; the original may contain more.' : 'Captured source text.';
    if (hasText && (row.text_truncated || row.truncated)) message += ' Preview shortened to 800 characters. Open the post for the complete captured text.';
    const note = create('p', 'feed-text-note', message); note.dataset.textStatus = status;
    return note;
  }

  function enforceTextOnly(card, row) {
    for (const node of card.querySelectorAll('.feed-embed, [data-feed-embed], .embed-slot, iframe, .twitter-tweet, .fb-post, .instagram-media, .threads-post, [data-feed-action="embed"], script[src]')) node.remove();
    const oldLink = card.querySelector('.feed-text-link');
    const meta = card.querySelector('.feed-meta') || recordMeta(row);
    if (oldLink?.contains(meta)) card.insertBefore(meta, oldLink);
    else if (!card.contains(meta)) card.insertBefore(meta, card.children[0] || null);
    for (const node of card.querySelectorAll('.feed-text-link, .feed-text, .feed-text-body, .feed-text-note')) node.remove();
    const link = textLink(row); const actions = card.querySelector('.feed-actions') || card.querySelector('.card-actions');
    if (actions && actions.parentNode === card) card.insertBefore(link, actions); else card.append(link);
    const note = textNote(row);
    if (actions && actions.parentNode === card) card.insertBefore(note, actions); else card.append(note);
  }

  function timed(promise, milliseconds, message, onTimeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { onTimeout?.(); reject(new Error(message)); }, milliseconds);
      Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  }
  function hydrate(root = document) {
    if (!listTextOnly) return;
    const cards = [];
    if (root.nodeType === 1 && root.matches?.('.feed-record')) cards.push(root);
    if (root.querySelectorAll) cards.push(...root.querySelectorAll('.feed-record'));
    for (const card of cards) {
      if (registered.has(card)) continue;
      try {
        const data = card.querySelector('script.feed-record-data');
        if (!data || data.getAttribute('type') !== 'application/json') throw new Error('Missing record data');
        const row = validateRecord(JSON.parse(data.textContent));
        if (card.dataset.feedId !== row.id) throw new Error('Record identity mismatch');
        if (dedupe && seen.has(row.id)) { card.remove(); continue; }
        if (listTextOnly) enforceTextOnly(card, row);
        registered.add(card); states.set(card, {row, status: listTextOnly ? 'text-only' : 'detail-owned'});
        if (dedupe) seen.add(row.id);
      } catch { card.remove(); say('An invalid post record was skipped.'); }
    }
    if (latest) {
      const rows = [...latest.children].map(card => states.get(card)?.row).filter(Boolean);
      if (rows.length) lastLatestTime = stamp(rows[rows.length - 1]);
    }
  }

  function renderNextLink() {
    if (!nextLink) return;
    nextLink.hidden = !nextURL;
    if (nextURL) { nextLink.href = nextURL; nextLink.textContent = 'Load more'; }
    else nextLink.removeAttribute('href');
    nextLink.removeAttribute('aria-disabled');
  }

  async function loadMore(manual = true) {
    if (!latest || !nextURL || loading || (!manual && autoBlocked)) return false;
    loading = true; if (manual) autoBlocked = false;
    const current = nextURL;
    if (nextLink) { nextLink.textContent = 'Loading…'; nextLink.setAttribute('aria-disabled', 'true'); }
    latest.setAttribute('aria-busy', 'true'); say('Loading more posts…');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 20000) : null;
    try {
      const url = safeFeedURL(current);
      if (visitedPages.has(url.href) || pageNumber(url) !== lastPage + 1) throw new Error('Repeated feed page');
      const response = await fetch(url.href, {credentials: 'same-origin', cache: 'no-store', headers: {Accept: 'text/html'}, ...(controller ? {signal: controller.signal} : {})});
      if (!response.ok || (response.url && safeFeedURL(response.url).href !== url.href)) throw new Error('Feed response unavailable');
      const type = response.headers?.get?.('Content-Type'); if (type && !type.toLowerCase().includes('text/html')) throw new Error('Unexpected feed content');
      const page = parseFeedPage(await response.text(), url.href);
      const pageSeen = new Set(); const rows = [];
      for (const row of page.rows) {
        if (seen.has(row.id) || pageSeen.has(row.id)) continue;
        if (stamp(row) > lastLatestTime) throw new Error('Latest feed moved backwards');
        pageSeen.add(row.id); rows.push(row);
      }
      const fragment = document.createDocumentFragment();
      for (const row of rows) fragment.append(createCard(row));
      latest.append(fragment); hydrate(latest);
      if (rows.length) lastLatestTime = stamp(rows[rows.length - 1]);
      visitedPages.add(url.href); lastPage = pageNumber(url); nextURL = page.next;
      renderNextLink();
      say(nextURL ? (rows.length ? rows.length + ' more posts loaded.' : 'No additional posts in this page. Load more to continue.') : 'End of the collected posts.');
      if (!rows.length && nextURL) autoBlocked = true;
      return true;
    } catch {
      autoBlocked = true; say('Could not load more posts. Use Retry to continue.');
      if (nextLink) { nextLink.hidden = false; nextLink.textContent = 'Retry loading posts'; nextLink.removeAttribute('aria-disabled'); }
      return false;
    } finally {
      if (timer !== null) clearTimeout(timer); loading = false; latest.removeAttribute('aria-busy');
    }
  }

  const toggle = document.querySelector('#archive-toggle');
  const panel = document.querySelector('#archive-panel');
  const closer = document.querySelector('#archive-close');
  const backdrop = document.querySelector('#archive-backdrop');
  let priorFocus = null, archivePromise = null, archiveLoaded = false;
  let panelBody = document.querySelector('#archive-panel-body') || panel?.querySelector('[data-archive-menu]');
  if (panel && !panelBody) { panelBody = create('div'); panelBody.id = 'archive-panel-body'; panel.append(panelBody); }
  if (panelBody?.querySelector('.year-group')) archiveLoaded = true;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function archiveURL(value) {
    const url = new URL(value, here.href);
    if (url.origin !== here.origin || url.pathname !== config.base + 'archive-menu.html' || url.search || url.hash || url.username || url.password) throw new Error('Untrusted archive menu URL');
    return url;
  }
  function parseArchiveMenu(text, requestedURL) {
    if (typeof text !== 'string' || text.length > 2000000) throw new Error('Invalid archive menu');
    const url = archiveURL(requestedURL);
    const parsed = new DOMParser().parseFromString(text, 'text/html');
    const canonicals = parsed.querySelectorAll('link[rel="canonical"]');
    if (canonicals.length !== 1 || canonicals[0].getAttribute('href') !== new URL(url.pathname, canonical.origin).href) throw new Error('Archive canonical mismatch');
    const source = parsed.querySelector('#archive-menu-content') || parsed.querySelector('[data-archive-months]');
    if (!source) throw new Error('Missing archive month list');
    const groups = [...source.querySelectorAll('.year-group')];
    if (!groups.length || groups.length > 300) throw new Error('Invalid archive year list');
    const fragment = document.createDocumentFragment(); const years = new Set();
    for (const group of groups) {
      const year = group.querySelector('h3')?.textContent.trim();
      if (!/^\d{4}$/.test(year || '') || years.has(year)) throw new Error('Invalid archive year');
      years.add(year);
      const section = create('section', 'year-group'); section.append(create('h3', '', year));
      const grid = create('nav', 'year-grid'); grid.setAttribute('aria-label', 'Months in ' + year);
      const months = [...group.querySelectorAll('.month-button')];
      if (months.length > 12 || !months.length) throw new Error('Invalid archive months');
      const usedMonths = new Set();
      for (const month of months) {
        const label = month.querySelector('b')?.textContent.trim();
        const labelIndex = monthNames.indexOf(label);
        if (labelIndex < 0 || usedMonths.has(labelIndex)) throw new Error('Invalid archive month label');
        usedMonths.add(labelIndex);
        const count = month.querySelector('span')?.textContent.trim() || '—';
        if (!/^(?:\d[\d,]*|—)$/.test(count)) throw new Error('Invalid archive month count');
        let entry;
        if (month.tagName.toLowerCase() === 'a') {
          const destination = new URL(month.getAttribute('href'), url.href);
          const path = config.base + 'archive/' + year + '-' + String(labelIndex + 1).padStart(2, '0') + '.html';
          if (destination.origin !== here.origin || destination.pathname !== path || destination.search || destination.hash || destination.username || destination.password) throw new Error('Untrusted archive month URL');
          entry = create('a', 'month-button'); entry.href = destination.pathname;
        } else {
          entry = create('span', 'month-button disabled'); entry.setAttribute('aria-disabled', 'true');
        }
        entry.append(create('b', '', label), create('span', '', count)); grid.append(entry);
      }
      section.append(grid); fragment.append(section);
    }
    return fragment;
  }
  async function loadArchiveMenu() {
    if (!panelBody || archiveLoaded || !config.archiveMenuUrl) return true;
    if (archivePromise) return archivePromise;
    archivePromise = (async () => {
      let message = panelBody.querySelector('#archive-menu-status');
      if (!message) { message = create('p', 'feed-embed-note'); message.id = 'archive-menu-status'; message.setAttribute('role', 'status'); panelBody.append(message); }
      message.textContent = 'Loading archive…';
      const retry = panelBody.querySelector('[data-feed-action="archive-retry"]'); if (retry) retry.remove();
      try {
        const url = archiveURL(config.archiveMenuUrl);
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const request = (async () => {
          const response = await fetch(url.href, {credentials: 'same-origin', cache: 'no-store', headers: {Accept: 'text/html'}, ...(controller ? {signal: controller.signal} : {})});
          if (!response.ok || (response.url && archiveURL(response.url).href !== url.href)) throw new Error('Archive menu unavailable');
          return await response.text();
        })();
        const text = await timed(request, 20000, 'Archive menu timed out', () => controller?.abort());
        const fragment = parseArchiveMenu(text, url.href);
        panelBody.replaceChildren(fragment); archiveLoaded = true; return true;
      } catch {
        message.textContent = 'Could not load the archive. Retry or open the archive page.';
        const button = create('button', '', 'Retry archive'); button.type = 'button'; button.dataset.feedAction = 'archive-retry'; panelBody.append(button);
        if (![...panelBody.querySelectorAll('a[href]')].some(link => link.getAttribute('href') === config.archiveMenuUrl)) {
          try { const link = create('a', '', 'Open archive page'); link.href = archiveURL(config.archiveMenuUrl).pathname; panelBody.append(link); } catch { /* Invalid configured URL is never exposed. */ }
        }
        return false;
      }
    })().finally(() => { archivePromise = null; });
    return archivePromise;
  }
  function closeArchive(restore = true) {
    if (!panel || panel.hidden) return;
    panel.hidden = true; if (backdrop) backdrop.hidden = true;
    toggle?.setAttribute('aria-expanded', 'false'); document.documentElement.classList.remove('feed-archive-open');
    if (restore) (priorFocus?.isConnected ? priorFocus : toggle)?.focus();
  }
  function openArchive() {
    if (!panel) return;
    priorFocus = document.activeElement; panel.hidden = false; if (backdrop) backdrop.hidden = false;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    toggle?.setAttribute('aria-expanded', 'true'); document.documentElement.classList.add('feed-archive-open');
    (closer || panel.querySelector('a[href], button'))?.focus();
    loadArchiveMenu();
  }
  if (toggle && panel) {
    toggle.setAttribute('aria-controls', 'archive-panel'); toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => panel.hidden ? openArchive() : closeArchive());
    closer?.addEventListener('click', () => closeArchive());
    backdrop?.addEventListener('click', () => closeArchive());
    panel.addEventListener('click', event => { if (event.target.closest('a[href]')) closeArchive(false); });
    document.addEventListener('keydown', event => {
      if (panel.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); closeArchive(); }
      if (event.key === 'Tab') {
        const focusable = [...panel.querySelectorAll('a[href], button, input, select, [tabindex]')].filter(e => !e.disabled && !e.hidden && e.getAttribute('tabindex') !== '-1' && e.getClientRects().length);
        if (!focusable.length) { event.preventDefault(); return; }
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) closeArchive(); });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-feed-action]');
    if (button?.dataset.feedAction === 'archive-open') { event.preventDefault(); openArchive(); }
    else if (button?.dataset.feedAction === 'archive-retry') { event.preventDefault(); loadArchiveMenu(); }
    else {
      const link = event.target.closest?.('a[href]');
      if (link && panel) {
        try {
          const url = new URL(link.getAttribute('href'), here.href);
          if (url.origin === here.origin && url.pathname === config.base && url.hash === '#archive') { event.preventDefault(); openArchive(); }
        } catch { /* Do not intercept malformed or unrelated navigation. */ }
      }
    }
  });
  nextLink?.addEventListener('click', event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); loadMore(true);
  });
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        if (entry.target === sentinel) loadMore(false);
      }
    }, {rootMargin: '600px 0px'});
  }
  window.SaysFeed = Object.freeze({createCard, hydrate, loadMore, validateRecord, parseFeedPage, safeFeedURL, openArchive, closeArchive, loadArchiveMenu, parseArchiveMenu});
  if (nextLink?.getAttribute('href')) {
    try { nextURL = safeFeedURL(nextLink.getAttribute('href')).href; lastPage = pageNumber(new URL(nextURL)) - 1; }
    catch { say('The next-page link is invalid.'); nextLink.hidden = true; }
  }
  hydrate();
  if (observer && sentinel && nextURL) observer.observe(sentinel);
  function checkVisible() {
    scrollTick = false;
    if (sentinel?.isConnected) {
      const rect = sentinel.getBoundingClientRect();
      if (rect.top < (window.innerHeight || 900) + 600 && rect.bottom > -200) loadMore(false);
    }
  }
  if (!observer) window.addEventListener('scroll', () => {
    if (scrollTick) return; scrollTick = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(checkVisible); else setTimeout(checkVisible, 50);
  }, {passive: true});
  if (typeof MutationObserver === 'function') new MutationObserver(changes => {
    for (const change of changes) {
      for (const node of change.removedNodes || []) if (node.nodeType === 1 && !node.isConnected) {
        const cards = node.matches?.('.feed-record') ? [node] : [];
        cards.push(...(node.querySelectorAll?.('.feed-record') || []));
        for (const card of cards) observer?.unobserve(card);
      }
      for (const node of change.addedNodes) if (node.nodeType === 1) hydrate(node);
    }
  }).observe(document.body, {childList: true, subtree: true});
})();
