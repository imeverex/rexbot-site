// Use Vercel's request-country headers, without logging or returning location or IP data.
const noticeRegions = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'SK', 'YT']);

export function GET(request) {
  const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase();
  const province = (request.headers.get('x-vercel-ip-country-region') || '').toUpperCase();
  const noticeAndOptOut = country === 'US' || (country === 'CA' && noticeRegions.has(province));
  // EEA/UK/Switzerland, Quebec, other countries and unknown locations keep opt-in.
  return Response.json({requireOptIn: !noticeAndOptOut}, {
    headers: {'Cache-Control': 'private, no-store', 'Vercel-CDN-Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'},
  });
}
