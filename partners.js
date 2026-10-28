// One controller owns the visible profile, indicator and eight-second cycle.
(() => {
  const section = document.querySelector('#partners');
  const spotlight = section?.querySelector('.partner-grid');
  if (!spotlight) return;
  const slides = [...spotlight.children];
  if (!slides.length) return;
  const navigation = section.querySelector('.partner-dots');
  const bar = section.querySelector('.partners-cycle-bar');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const CYCLE = 8000;
  const previous = section.querySelector('.partner-prev');
  const next = section.querySelector('.partner-next');
  const pause = section.querySelector('.partner-pause');
  const position = section.querySelector('.partner-position');
  let userPaused = reducedMotion.matches;
  let index = 0, timer, raf, cycleStart = 0;
  let hovering = spotlight.matches(':hover'), suspended = false;
  const dots = [];
  section.setAttribute('aria-roledescription', 'carousel');
  slides.forEach((slide, i) => {
    slide.id = `partner-slide-${i + 1}`;
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-label', `${i + 1} of ${slides.length}`);
    if (!navigation) return;
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'partner-dot';
    dot.textContent = slide.querySelector('h3').textContent;
    dot.setAttribute('aria-label', `Show ${slide.querySelector('h3').textContent}`);
    dot.setAttribute('aria-controls', slide.id);
    dot.addEventListener('click', () => show(i));
    dot.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (i + 1) % slides.length;
      else if (event.key === 'ArrowLeft') next = (i + slides.length - 1) % slides.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = slides.length - 1;
      else return;
      event.preventDefault();
      dots[next].focus();
      show(next);
    });
    dots.push(dot);
  });
  if (navigation) {
    navigation.replaceChildren(...dots);
    navigation.hidden = slides.length < 2;
  }
  function shouldRun() {
    return slides.length > 1 && !hovering && !(section.contains(document.activeElement) && document.activeElement !== pause)
      && !document.hidden && !suspended && !userPaused;
  }
  function stop() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
  }
  function progress() {
    if (!bar || !shouldRun()) return;
    const elapsed = Math.min(Date.now() - cycleStart, CYCLE);
    bar.style.width = `${elapsed / CYCLE * 100}%`;
    if (elapsed < CYCLE) raf = requestAnimationFrame(progress);
  }
  function schedule() {
    stop();
    if (bar) bar.style.width = '0%';
    if (!shouldRun()) return;
    cycleStart = Date.now();
    timer = setTimeout(() => show((index + 1) % slides.length), CYCLE);
    if (bar) raf = requestAnimationFrame(progress);
  }
  function show(next) {
    index = next;
    slides.forEach((slide, i) => { slide.hidden = i !== index; });
    dots.forEach((dot, i) => {
      if (i === index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    if (position) position.textContent = `${index + 1} / ${slides.length}`;
    section.dispatchEvent(new Event('partnerchange'));
    schedule();
  }
  spotlight.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') { hovering = true; schedule(); }
  });
  spotlight.addEventListener('pointerleave', () => { hovering = false; schedule(); });
  spotlight.addEventListener('pointercancel', () => { hovering = false; schedule(); });
  section.addEventListener('focusin', schedule);
  section.addEventListener('focusout', () => queueMicrotask(schedule));
  document.addEventListener('visibilitychange', schedule);
  function updatePause() {
    if (!pause) return;
    pause.textContent = userPaused ? 'Play rotation' : 'Pause rotation';
    pause.setAttribute('aria-label', userPaused ? 'Play automatic partner rotation' : 'Pause automatic partner rotation');
  }
  previous?.addEventListener('click', () => show((index + slides.length - 1) % slides.length));
  next?.addEventListener('click', () => show((index + 1) % slides.length));
  pause?.addEventListener('click', () => { userPaused = !userPaused; updatePause(); schedule(); });
  reducedMotion.addEventListener('change', () => { userPaused = reducedMotion.matches; updatePause(); schedule(); });
  updatePause();
  window.addEventListener('pagehide', () => { suspended = true; stop(); });
  window.addEventListener('pageshow', () => { suspended = false; schedule(); });
  show(0);
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
    card.closest('li').querySelector('.partner-live').hidden = true;
    card.closest('li').querySelector('.partner-visit-copy').textContent = 'Visit channel';
    card.setAttribute('aria-label', `Visit ${card.closest('li').querySelector('h3').textContent} on Twitch (opens in a new tab)`);
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
        card.closest('li').querySelector('.partner-live').hidden = !live;
        card.closest('li').querySelector('.partner-visit-copy').textContent = live ? 'Watch live' : 'Visit channel';
        card.setAttribute('aria-label', `${live ? 'Watch' : 'Visit'} ${card.closest('li').querySelector('h3').textContent}${live ? ' live' : ''} on Twitch (opens in a new tab)`);
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
    frame.title = `${card.closest('li').querySelector('h3').textContent} live on Twitch`;
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
    card.closest('li').querySelector('.partner-info').prepend(card.closest('li').querySelector('.partner-live'));
    if (await mayAutoplay()) { if (box.isConnected) embed(box, card); return; }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'partner-play';
    button.innerHTML = '<span aria-hidden="true">&#9654;</span> Watch here';
    button.setAttribute('aria-label', `Watch ${card.closest('li').querySelector('h3').textContent} live here (loads Twitch's player)`);
    button.addEventListener('click', () => embed(box, card));
    if (box.isConnected) box.replaceChildren(button);
  }
  function stopPlayer(card) {
    const li = card.parentElement;
    li.querySelector('.partner-player')?.remove();
    li.classList.remove('has-player');
    li.style.removeProperty('--player-h');
    card.querySelector('.partner-stream').prepend(card.closest('li').querySelector('.partner-live'));
  }
  document.querySelector('#partners').addEventListener('partnerchange', () => cards.forEach(card => {
    if (!card.closest('li').querySelector('.partner-live').hidden) showPlayer(card); else stopPlayer(card);
  }));
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => cards.forEach(card => {
      if (!card.closest('li').querySelector('.partner-live').hidden) showPlayer(card);
    }), 200);
  });
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', () => {clearTimeout(timer); clearTimeout(expiry); inFlight?.abort(); hide();});
  window.addEventListener('pageshow', refresh);
  refresh();
})();
