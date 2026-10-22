// Serves /dashboard from Railway like the old plain rewrite did, but adds
// the site-wide status notice. Lets the notice reach the dashboard while
// Railway deploys are paused. Put the /dashboard rewrite back to Railway
// (vercel.json) once the notice comes down.
const UPSTREAM = 'https://rextwitchbot-production.up.railway.app/dashboard';
const PASS = ['content-type', 'cache-control', 'location', 'vary', 'content-security-policy', 'x-frame-options',
  'referrer-policy', 'x-content-type-options'];

export async function GET(request) {
  const url = new URL(request.url);
  const upstream = await fetch(UPSTREAM + url.search, {
    redirect: 'manual',
    headers: {
      cookie: request.headers.get('cookie') || '',
      'user-agent': request.headers.get('user-agent') || '',
      accept: request.headers.get('accept') || 'text/html',
    },
  });
  const headers = new Headers();
  for (const name of PASS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) headers.append('set-cookie', cookie);
  let body = await upstream.text();
  if (upstream.status === 200 && (headers.get('content-type') || '').includes('text/html')) {
    body = body.replace('</body>', '<script src="/status-notice.js" defer></script></body>');
  }
  return new Response(body, {status: upstream.status, headers});
}
