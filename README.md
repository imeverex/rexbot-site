# rexbot-site
Download page for Rex Now Playing Widget by everex

## Search discovery

`sitemap.xml` lists the seven public pages using absolute `https://rexbotapp.com` URLs.
When adding or removing public pages, update that list. Keep authenticated routes,
OAuth callbacks, private overlay links and API endpoints out of it.

`robots.txt` advertises the sitemap and asks crawlers to avoid dashboard, login,
overlay and internal API routes. Application authentication still controls access.

`api/analytics-consent.js` selects the dashboard analytics notice mode from Vercel's
country/province headers. It returns only `requireOptIn`, never location or IP data,
and must not be cached across visitors. Unknown locations keep opt-in.

## Community partners

The homepage `#partners` section features confirmed community partners, with a
maximum of five profiles. Add or remove the whole list item in `index.html` and
its files in `partners/`; styles are scoped in `partners.css`. Only list confirmed
partners and use their approved public profile and stream imagery. Keep images
local so visitors do not need to load Twitch embeds or tracking to view the cards.
Use a stream still, not an advertisement, and do not imply that a saved still is
live. The two initial channel links are KinneticEnergy and GankNSpank72.
