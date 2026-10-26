/* Carry a partner tag through this site visit. No tracking cookies or browser storage. */
(() => {
  const ref = new URL(location.href).searchParams.get('ref')?.trim().toLowerCase();
  if (!ref || !/^[a-z0-9_]{1,25}$/.test(ref)) return;
  const pages = new Set(['/', '/index.html', '/contact.html', '/help.html', '/music-bot.html',
    '/roadmap.html', '/privacy.html', '/terms.html', '/partner-invite.html', '/invite', '/partner', '/twitch/login', '/dashboard']);
  function carry() {
    document.querySelectorAll('a[href]').forEach(link => {
      const url = new URL(link.getAttribute('href'), location.href);
      if (url.origin !== location.origin || !pages.has(url.pathname) || url.searchParams.has('ref')) return;
      url.searchParams.set('ref', ref);
      const href = url.pathname + url.search + url.hash;
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    });
  }
  carry();
  new MutationObserver(carry).observe(document.body, {subtree:true, childList:true,
    attributes:true, attributeFilter:['href']});
  window.addEventListener('pageshow', carry);
})();
