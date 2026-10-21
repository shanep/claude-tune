// The help page's moving parts: copy buttons, the tip filters, the contents
// filter and highlight, the theme switch and the scroll effects.

const root = document.documentElement;

function flash(element, done) {
  element.classList.add('copied');
  const label = element.textContent;
  if (done !== undefined) {
    element.textContent = done;
  }
  setTimeout(() => {
    element.classList.remove('copied');
    if (done !== undefined) {
      element.textContent = label;
    }
  }, 1400);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

for (const button of document.querySelectorAll('.code .copy')) {
  button.addEventListener('click', async () => {
    const code = button.closest('.code').querySelector('code').textContent;
    if (await copy(code.trim())) {
      flash(button, 'Copied');
    }
  });
}

for (const button of document.querySelectorAll('.copy-text')) {
  button.addEventListener('click', async () => {
    if (await copy(button.dataset.copy)) {
      flash(button);
    }
  });
}

// Tip filters: show every tip, or only one severity.
for (const group of document.querySelectorAll('.filters')) {
  const tips = group.nextElementSibling.querySelectorAll('.tip');
  for (const chip of group.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      for (const other of group.querySelectorAll('.chip')) {
        other.classList.toggle('on', other === chip);
      }
      for (const tip of tips) {
        tip.hidden = chip.dataset.filter !== 'all' && tip.dataset.severity !== chip.dataset.filter;
      }
    });
  }
}

// Contents filter. Press / to jump to it.
const search = document.querySelector('.search input');
const items = [...document.querySelectorAll('.toc li')];
search.addEventListener('input', () => {
  const query = search.value.trim().toLowerCase();
  for (const item of items) {
    const match = item.textContent.toLowerCase().includes(query);
    item.classList.toggle('hidden', !match);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== search) {
    event.preventDefault();
    search.focus();
  } else if (event.key === 'Escape' && document.activeElement === search) {
    search.value = '';
    search.dispatchEvent(new Event('input'));
    search.blur();
  }
});

// Theme: follow the system, or pick light or dark. The choice is remembered.
const THEMES = ['auto', 'light', 'dark'];
const themeButton = document.querySelector('.theme');
const themeLabel = themeButton.querySelector('.theme-label');
function showTheme(theme) {
  themeLabel.textContent = theme[0].toUpperCase() + theme.slice(1);
  if (theme === 'auto') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  try {
    if (theme === 'auto') {
      localStorage.removeItem('tune-theme');
    } else {
      localStorage.setItem('tune-theme', theme);
    }
  } catch {
    // Some browsers keep no storage for a file:// page. The switch still works.
  }
}
showTheme(root.dataset.theme ?? 'auto');
themeButton.addEventListener('click', () => {
  const now = root.dataset.theme ?? 'auto';
  showTheme(THEMES[(THEMES.indexOf(now) + 1) % THEMES.length]);
});

// Highlight the part of the contents you are reading.
const links = new Map(
  [...document.querySelectorAll('.toc a')].map((link) => [link.getAttribute('href').slice(1), link]),
);
const targets = [...links.keys()].map((id) => document.getElementById(id)).filter(Boolean);
function highlight() {
  let current = targets[0];
  for (const target of targets) {
    if (target.offsetParent !== null && target.getBoundingClientRect().top < window.innerHeight * 0.2) {
      current = target;
    }
  }
  for (const [id, link] of links) {
    const on = id === current?.id;
    if (on && !link.classList.contains('active')) {
      link.scrollIntoView({ block: 'nearest' });
    }
    link.classList.toggle('active', on);
  }
}

// Scroll progress and the back to top button.
const backToTop = document.querySelector('.top');
function onScroll() {
  const max = root.scrollHeight - root.clientHeight;
  root.style.setProperty('--scrolled', max > 0 ? String(root.scrollTop / max) : '0');
  backToTop.classList.toggle('shown', root.scrollTop > 600);
  highlight();
}
document.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Fade each part in the first time it scrolls into view.
const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        reveal.unobserve(entry.target);
      }
    }
  },
  { rootMargin: '0px 0px -10% 0px' },
);
for (const section of document.querySelectorAll('.reveal')) {
  reveal.observe(section);
}
// A link straight to a part should not land on a blank page.
if (location.hash !== '') {
  for (const section of document.querySelectorAll('.reveal')) {
    section.classList.add('in');
  }
}
