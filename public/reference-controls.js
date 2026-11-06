const theme = localStorage.getItem('sidequestly-theme') || 'light';
document.documentElement.classList.add(theme);
document.documentElement.style.setProperty('--page-width', '768px');
document.documentElement.style.scrollBehavior = 'smooth';
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const label = button.getAttribute('aria-label') || button.textContent.trim();
  if (label === 'Theme') {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(next);
    localStorage.setItem('sidequestly-theme', next);
  } else if (label === 'Product') {
    location.href = '/product';
  } else if (/^(Start|Sign in|Sign up|Get started|Start free|Choose Basic|Upgrade)/i.test(label)) {
    location.href = '/app';
  } else if (button.getAttribute('aria-expanded') !== null) {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (panel) {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(expanded));
      panel.hidden = !expanded;
      panel.dataset.state = expanded ? 'open' : 'closed';
    }
  }
});
addEventListener('scroll', () => {
  const header = document.querySelector('header');
  if (header) {
    header.style.backdropFilter = scrollY > 20 ? 'blur(16px)' : '';
    header.style.background = scrollY > 20 ? 'var(--background)' : '';
  }
}, { passive: true });
