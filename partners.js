// Rotate automatically. Hover and keyboard focus hold the current partner.
(() => {
  const section = document.querySelector('#partners');
  const spotlight = section?.querySelector('.partner-grid');
  if (!spotlight) return;
  const slides = [...spotlight.children];
  if (!slides.length) return;
  let index = 0, timer, raf;
  let hovering = spotlight.matches(':hover');
  const focused = () => spotlight.contains(document.activeElement);
  const CYCLE = 8000;
  const bar = section.querySelector('.partners-cycle-bar');
  let cycleStart = 0;
  section.setAttribute('aria-roledescription', 'carousel');
  slides.forEach((slide, i) => {
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-label', `${i + 1} of ${slides.length}`);
  });
  function shouldRun() {
    return slides.length > 1 && !hovering && !focused() && !document.hidden;
  }
  function startProgress() {
    stopProgress();
    if (!bar || !shouldRun()) return;
    cycleStart = Date.now();
    if (bar) bar.style.width = '0%';
    raf = requestAnimationFrame(drawProgress);
  }
  function stopProgress() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function drawProgress() {
    if (!bar) return;
    const elapsed = Math.min(Date.now() - cycleStart, CYCLE);
    bar.style.width = `${(elapsed / CYCLE) * 100}%`;
    if (elapsed < CYCLE && shouldRun()) raf = requestAnimationFrame(drawProgress);
  }
  function resetProgress() {
    stopProgress();
    cycleStart = Date.now();
    if (bar) bar.style.width = '0%';
    if (shouldRun()) startProgress();
  }
  function schedule() {
    clearTimeout(timer);
    if (shouldRun()) {
      timer = setTimeout(() => {
        index = (index + 1) % slides.length;
        slides.forEach((slide, i) => {slide.hidden = i !== index;});
        section.dispatchEvent(new Event('partnerchange'));
        schedule();
      }, CYCLE);
      startProgress();
    } else {
      stopProgress();
    }
  }
  spotlight.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {hovering = true; schedule();}
  });
  spotlight.addEventListener('pointerleave', () => {hovering = false; schedule();});
  spotlight.addEventListener('pointercancel', () => {hovering = false; schedule();});
  spotlight.addEventListener('focusin', schedule);
  spotlight.addEventListener('focusout', () => queueMicrotask(schedule));
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', () => clearTimeout(timer));
  window.addEventListener('pageshow', schedule);
  section.addEventListener('partnerchange', resetProgress);
  schedule();
})();
// Only show a live claim while a recent, successful Twitch check confirms it.
(() => {
  const cards = [...document.querySelectorAll('.partner-card[data-partner]')];
  if (!cards.length) return;
  let timer;
  let expiry;
  let inFlight;
  const hide = () => cards.forEach(card => {
    stopPlayer(card);
    card.querySelector('.partner-live').hidden = true;
    card.querySelector('.partner-visit-copy').textContent = 'Visit channel';
    card.setAttribute('aria-label', `Visit ${card.querySelector('h3').textContent} on Twitch (opens in a new tab)`);
  });
  async function refresh() {
    clearTimeout(timer);
    if (inFlight) inFlight.abort();
    if (document.hidden) {clearTimeout(expiry); hide(); return;}
    const controller = new AbortController();
    inFlight = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/partners/status.json', {signal: controller.signal, credentials: 'omit', cache: 'no-store'});
      if (!response.ok) throw new Error('Status unavailable');
      const data = await response.json();
      const age = Date.now() / 1000 - data.checked_at;
      if (!Number.isFinite(age) || age < -30 || age > 120) throw new Error('Status expired');
      if (inFlight !== controller || document.hidden) return;
      cards.forEach(card => {
        const live = data.partners?.[card.dataset.partner] === true;
        if (live) showPlayer(card); else stopPlayer(card);
        card.querySelector('.partner-live').hidden = !live;
        card.querySelector('.partner-visit-copy').textContent = live ? 'Watch live' : 'Visit channel';
        card.setAttribute('aria-label', `${live ? 'Watch' : 'Visit'} ${card.querySelector('h3').textContent}${live ? ' live' : ''} on Twitch (opens in a new tab)`);
      });
      clearTimeout(expiry);
      expiry = setTimeout(hide, Math.max(0, (120 - age) * 1000));
    } catch {
      if (inFlight === controller) hide();
    } finally {
      clearTimeout(timeout);
      if (inFlight === controller) {
        inFlight = null;
        if (!document.hidden) timer = setTimeout(refresh, 60000);
      }
    }
  }
  // Live partners play muted in the card through Twitch's official player.
  // Twitch requires the player to be at least 400x300 and uncovered, so it
  // sits beside the card link (not inside it), the Live badge moves out from
  // under it, and narrow cards (phones) keep the still and the Twitch link.
  // It autoplays only where the site may start third-party tracking without
  // asking first (see /api/analytics-consent); elsewhere, or with reduced
  // motion, visitors press Watch here to load it.
  const MIN_W = 400, MIN_H = 300;
  let autoplay;
  const mayAutoplay = () => autoplay ??= matchMedia('(prefers-reduced-motion: reduce)').matches
    ? Promise.resolve(false)
    : fetch('/api/analytics-consent', {credentials: 'omit', cache: 'no-store'})
      .then(r => r.ok ? r.json() : {requireOptIn: true}).then(d => d.requireOptIn === false).catch(() => false);
  const playerSize = card => {
    const w = card.querySelector('.partner-stream').getBoundingClientRect().width;
    return w >= MIN_W ? Math.max(MIN_H, Math.round(w * 9 / 16)) : 0;
  };
  function embed(box, card) {
    const frame = document.createElement('iframe');
    frame.src = `https://player.twitch.tv/?channel=${encodeURIComponent(card.dataset.partner)}&parent=${encodeURIComponent(location.hostname)}&muted=true&autoplay=true`;
    frame.title = `${card.querySelector('h3').textContent} live on Twitch`;
    frame.allow = 'autoplay; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
    box.replaceChildren(frame);
  }
  async function showPlayer(card) {
    // Only the visible spotlight may load a player. Narrow cards keep the still.
    if (card.closest('li').hidden) return stopPlayer(card);
    const li = card.parentElement, playing = li.querySelector('.partner-player');
    li.classList.add('has-player');
    const height = matchMedia('(min-width: 651px)').matches ? playerSize(card) : 0;
    if (!height) return stopPlayer(card);
    li.style.setProperty('--player-h', height + 'px');
    if (playing) return;
    const box = document.createElement('div');
    box.className = 'partner-player';
    li.append(box);
    card.querySelector('.partner-info').prepend(card.querySelector('.partner-live'));
    if (await mayAutoplay()) { if (box.isConnected) embed(box, card); return; }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'partner-play';
    button.innerHTML = '<span aria-hidden="true">&#9654;</span> Watch here';
    button.setAttribute('aria-label', `Watch ${card.querySelector('h3').textContent} live here (loads Twitch's player)`);
    button.addEventListener('click', () => embed(box, card));
    if (box.isConnected) box.replaceChildren(button);
  }
  function stopPlayer(card) {
    const li = card.parentElement;
    li.querySelector('.partner-player')?.remove();
    li.classList.remove('has-player');
    li.style.removeProperty('--player-h');
    card.querySelector('.partner-stream').prepend(card.querySelector('.partner-live'));
  }
  document.querySelector('#partners').addEventListener('partnerchange', () => cards.forEach(card => {
    if (!card.querySelector('.partner-live').hidden) showPlayer(card); else stopPlayer(card);
  }));
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => cards.forEach(card => {
      if (!card.querySelector('.partner-live').hidden) showPlayer(card);
    }), 200);
  });
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', () => {clearTimeout(timer); clearTimeout(expiry); inFlight?.abort(); hide();});
  window.addEventListener('pageshow', refresh);
  refresh();
})();
