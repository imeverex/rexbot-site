# rexbot-site
Download page for Rex Now Playing Widget by everex

## Search discovery

`sitemap.xml` lists the seven public pages using absolute `https://rexbotapp.com` URLs.
When adding or removing public pages, update that list. Keep authenticated routes,
OAuth callbacks, private overlay links and API endpoints out of it.

`robots.txt` advertises the sitemap and asks crawlers to avoid dashboard, login,
overlay and internal API routes. Application authentication still controls access.
