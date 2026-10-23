// Site-wide service notice, shown on the public pages and (through
// api/dashboard.js) on the dashboard. To take it down, empty NOTICE.
(function () {
  var NOTICE = 'Following the recent Railway security breach, we took precautionary steps to protect RexBot and its users. ' +
    'You may need to reauthorize some of your RexBot connections. ' +
    'RexBot and user data were not affected by the breach. ' +
    'We took these steps to reduce risk out of an abundance of caution for our users. ' +
    'Thank you for working with us. \u2014 Evertex';
  if (!NOTICE || document.getElementById('rexStatusNotice')) return;
  var bar = document.createElement('div');
  bar.id = 'rexStatusNotice';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:relative;z-index:1000;display:flex;gap:12px;align-items:center;justify-content:center;' +
    'padding:10px 44px 10px 16px;background:#003344;border-bottom:2px solid #00C6FF;color:#FFFFFF;' +
    'font:500 14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;';
  var text = document.createElement('span');
  text.textContent = NOTICE;
  text.style.cssText = 'max-width:1200px;';
  var close = document.createElement('button');
  close.type = 'button'; close.setAttribute('aria-label', 'Hide this notice'); close.textContent = '×';
  close.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);width:32px;height:32px;' +
    'background:none;border:0;color:inherit;font-size:22px;line-height:1;cursor:pointer;';
  close.onclick = function () { bar.remove(); };
  bar.appendChild(text); bar.appendChild(close);
  document.body.prepend(bar);
})();
