// Only show a live claim while a recent, successful Twitch check confirms it.
(() => {
  const cards = [...document.querySelectorAll('.partner-card[data-partner]')];
  if (!cards.length) return;
  let timer;
  let expiry;
  let inFlight;
  const hide = () => cards.forEach(card => {
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
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', () => {clearTimeout(timer); clearTimeout(expiry); inFlight?.abort(); hide();});
  window.addEventListener('pageshow', refresh);
  refresh();
})();
