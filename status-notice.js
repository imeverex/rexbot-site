// Site-wide service notice, shown on the public pages and (through
// api/dashboard.js) on the dashboard. To take it down, empty NOTICE.
(function () {
  var NOTICE = 'RexBot\'s hosting provider, Railway, is having a major outage and a security incident. ' +
    'The bot is still running, but updates are on hold until Railway is back. ' +
    'As a precaution you may need to log in to RexBot again soon.';
  var LINK = 'https://status.railway.com';
  if (!NOTICE || document.getElementById('rexStatusNotice')) return;
  var bar = document.createElement('div');
  bar.id = 'rexStatusNotice';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:relative;z-index:1000;display:flex;gap:12px;align-items:center;justify-content:center;' +
    'padding:10px 44px 10px 16px;background:#C62828;border-bottom:2px solid #8E1414;color:#FFFFFF;' +
    'font:500 14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;';
  var text = document.createElement('span');
  text.textContent = NOTICE + ' ';
  var a = document.createElement('a');
  a.href = LINK; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.textContent = 'Railway status';
  a.style.cssText = 'color:#FFFFFF;font-weight:700;text-decoration:underline;white-space:nowrap;';
  text.appendChild(a);
  var close = document.createElement('button');
  close.type = 'button'; close.setAttribute('aria-label', 'Hide this notice'); close.textContent = '×';
  close.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);width:32px;height:32px;' +
    'background:none;border:0;color:inherit;font-size:22px;line-height:1;cursor:pointer;';
  close.onclick = function () { bar.remove(); };
  bar.appendChild(text); bar.appendChild(close);
  document.body.prepend(bar);
})();
