(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('#faq .faq-item').forEach((item, index) => {
    const button = item.querySelector('.faq-q');
    const answer = item.querySelector('.faq-a');
    const icon = button.querySelector('svg');
    let animation;
    let expanded = false;
    button.type = 'button';
    button.id = `faq-question-${index + 1}`;
    answer.id = `faq-answer-${index + 1}`;
    button.setAttribute('aria-controls', answer.id);
    button.setAttribute('aria-expanded', 'false');
    answer.setAttribute('aria-labelledby', button.id);
    answer.setAttribute('role', 'region');
    answer.hidden = true;
    answer.inert = true;
    if (icon) icon.setAttribute('aria-hidden', 'true');
    const settle = () => {
      if (animation) { animation.cancel(); animation = null; }
      answer.hidden = !expanded;
      answer.style.height = '';
    };
    button.addEventListener('click', () => {
      const from = answer.hidden ? 0 : answer.getBoundingClientRect().height;
      if (animation) { animation.cancel(); animation = null; }
      expanded = !expanded;
      item.classList.toggle('open', expanded);
      button.setAttribute('aria-expanded', String(expanded));
      answer.inert = !expanded;
      answer.hidden = false;
      if (reduced.matches || !answer.animate) { settle(); return; }
      const to = expanded ? answer.scrollHeight : 0;
      animation = answer.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: 200, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'both'
      });
      animation.onfinish = settle;
    });
    reduced.addEventListener('change', settle);
  });
})();
