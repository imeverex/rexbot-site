/* Public pages reflect the server session without storing login state locally. */
(() => {
  const originals = new Map();
  let authenticated = false;
  let checking = false;
  function updateLinks() {
    document.querySelectorAll('a[href]').forEach(link => {
      const url = new URL(link.getAttribute('href'), location.href);
      if (url.origin !== location.origin || url.pathname !== '/twitch/login') return;
      const node = link.querySelector('span') || [...link.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      if (!node) return;
      if (!originals.has(link)) originals.set(link, {node, text:node.textContent});
      if (!authenticated) return;
      link.href = '/dashboard';
      node.textContent = 'Open dashboard';
    });
    if (!authenticated) {
      for (const [link, original] of originals) {
        const url = new URL(link.getAttribute('href'), location.href);
        if (url.origin !== location.origin || url.pathname !== '/dashboard') continue;
        link.href = '/twitch/login';
        if (original.node.textContent !== original.text) original.node.textContent = original.text;
      }
    }
    const back = document.querySelector('[data-contact-back]');
    if (back) {
      const href = authenticated ? '/dashboard#contact' : '/';
      const current = new URL(back.getAttribute('href'), location.href);
      const target = new URL(href, location.href);
      // Referral tags may be added independently; compare destinations without stripping them.
      if (current.origin !== target.origin || current.pathname !== target.pathname || current.hash !== target.hash) back.href = href;
      back.querySelector('span').textContent = authenticated ? 'Back to dashboard' : 'Back to home';
    }
  }
  async function refresh() {
    if (checking) return;
    checking = true;
    try {
      const response = await fetch('/session/status', {credentials:'same-origin', cache:'no-store'});
      if (!response.ok) return;
      const status = await response.json();
      if (typeof status.authenticated !== 'boolean') return;
      authenticated = status.authenticated;
      updateLinks();
    } catch { /* A failed status check does not clear a session. */ }
    finally { checking = false; }
  }
  new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes')) updateLinks();
  }).observe(document.body, {subtree:true, attributes:true, attributeFilter:['href']});
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
})();
