// Turns docs/help.md into the help page tune help --open shows. Everything is
// inlined (style, script and icon) so the page opens without the network.
import { Marked } from 'marked';

const SEVERITY = /^(?<id>[\w-]+) \((?<severity>high|medium|low)\)$/u;

function slug(text) {
  return text.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replaceAll(/^-|-$/gu, '');
}

function escape(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** A shell line with its trailing comment dimmed. */
function shellLine(line) {
  const at = line.search(/(?:^|\s)#/u);
  if (at === -1) {
    return `<span class="line">${escape(line)}</span>`;
  }
  return `<span class="line">${escape(line.slice(0, at))}<span class="comment">${escape(line.slice(at))}</span></span>`;
}

const marked = new Marked({
  renderer: {
    heading({ tokens, depth, text }) {
      const id = slug(text);
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}<a class="anchor" href="#${id}" aria-label="Link to this part">#</a></h${depth}>\n`;
    },
    code({ text, lang }) {
      const shell = lang === 'bash';
      const label = shell ? 'Terminal' : 'Claude Code';
      const body = shell ? text.split('\n').map(shellLine).join('\n') : escape(text);
      return `<figure class="code${shell ? ' shell' : ''}">
<figcaption><span class="dots"><i></i><i></i><i></i></span><span>${label}</span><button class="copy" type="button">Copy</button></figcaption>
<pre><code>${body}</code></pre>
</figure>\n`;
    },
  },
});

/** Renders tokens, with each table in a box that scrolls on narrow screens. */
function render(tokens) {
  return tokens.length === 0
    ? ''
    : marked.parser(tokens).replaceAll('<table>', '<div class="table"><table>').replaceAll('</table>', '</table></div>');
}

function tipCard(tip) {
  const { id, severity } = tip;
  return `<article class="tip ${severity}" id="${id}" data-severity="${severity}">
<header><code>${id}</code><span class="badge ${severity}">${severity}</span><a class="anchor" href="#${id}" aria-label="Link to this tip">#</a></header>
${render(tip.body)}</article>\n`;
}

function sectionHtml(section, index) {
  const number = String(index + 1).padStart(2, '0');
  let html = `<section class="reveal" aria-labelledby="${section.id}">
<h2 id="${section.id}"><span class="num">${number}</span>${marked.parseInline(section.title)}<a class="anchor" href="#${section.id}" aria-label="Link to this part">#</a></h2>\n`;
  let run = [];
  let tips = [];
  const flushRun = () => {
    html += render(run);
    run = [];
  };
  const flushTips = () => {
    if (tips.length === 0) {
      return;
    }
    const counts = { high: 0, medium: 0, low: 0 };
    for (const tip of tips) {
      counts[tip.severity] += 1;
    }
    html += `<div class="filters" role="group" aria-label="Show tips by severity">
<button type="button" class="chip on" data-filter="all">All <b>${tips.length}</b></button>
${['high', 'medium', 'low'].map((level) => `<button type="button" class="chip ${level}" data-filter="${level}">${level} <b>${counts[level]}</b></button>`).join('\n')}
</div>
<div class="tips">\n${tips.map(tipCard).join('')}</div>\n`;
    tips = [];
  };
  for (const item of section.body) {
    if ('severity' in item) {
      flushRun();
      tips.push(item);
    } else {
      flushTips();
      run.push(item);
    }
  }
  flushRun();
  flushTips();
  return `${html}</section>\n`;
}

/** The contents list: every part, with the tips and other subheadings under it. */
function contents(sections) {
  return sections
    .map((section) => {
      const children = section.body
        .filter((item) => 'severity' in item || (item.type === 'heading' && item.depth === 3))
        .map((item) =>
          'severity' in item
            ? `<li><a href="#${item.id}"><i class="dot ${item.severity}"></i>${item.id}</a></li>`
            : `<li><a href="#${slug(item.text)}">${marked.parseInline(item.text)}</a></li>`,
        )
        .join('');
      return `<li><a href="#${section.id}">${marked.parseInline(section.title)}</a>${children === '' ? '' : `<ul>${children}</ul>`}</li>`;
    })
    .join('\n');
}

export function helpPage({ markdown, style, script, icon }) {
  const intro = [];
  const sections = [];
  let section = null;
  let tip = null;
  for (const token of marked.lexer(markdown)) {
    const heading = token.type === 'heading' ? token : null;
    if (heading?.depth === 1) {
      continue;
    }
    if (heading?.depth === 2) {
      section = { id: slug(heading.text), title: heading.text, body: [] };
      sections.push(section);
      tip = null;
      continue;
    }
    const match = heading?.depth === 3 ? SEVERITY.exec(heading.text) : null;
    if (match !== null && section !== null) {
      tip = { id: match.groups.id, severity: match.groups.severity, body: [] };
      section.body.push(tip);
      continue;
    }
    if (heading !== null) {
      tip = null;
    }
    (tip?.body ?? section?.body ?? intro).push(token);
  }

  const tipCount = sections.flatMap((each) => each.body).filter((item) => 'severity' in item).length;
  const suggestions = (sections.find((each) => each.id === 'fixes')?.body ?? []).find(
    (item) => item.type === 'table' && item.header[0]?.text === 'Id',
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>tune help</title>
<script>
try { const theme = localStorage.getItem('tune-theme'); if (theme) document.documentElement.dataset.theme = theme; } catch {}
document.documentElement.classList.add('js');
</script>
<style>
${style}</style>
</head>
<body>
<div class="progress" aria-hidden="true"></div>
<header class="hero">
<div class="glow" aria-hidden="true"></div>
<div class="hero-inner">
<div class="logo">${icon}</div>
<div class="hero-text">
<p class="eyebrow">Claude Code plugin</p>
<h1>tune</h1>
<p class="tagline">Where your tokens went, and what to change.</p>
<div class="lede">${render(intro)}</div>
<ul class="stats">
<li><b>${tipCount}</b> tips</li>
<li><b>${suggestions?.rows.length ?? 0}</b> skills and agents it can write</li>
<li><b>0</b> bytes sent anywhere</li>
</ul>
<div class="cta">
<button type="button" class="pill copy-text" data-copy="/tune"><span>Run in Claude Code</span><code>/tune</code></button>
<button type="button" class="pill copy-text" data-copy="/tune install"><span>Get the terminal command</span><code>/tune install</code></button>
</div>
</div>
</div>
</header>
<div class="layout">
<aside class="sidebar">
<div class="sidebar-inner">
<label class="search"><span class="sr">Filter the contents</span><input type="search" placeholder="Filter" autocomplete="off"><kbd>/</kbd></label>
<nav aria-label="Contents"><ul class="toc">
${contents(sections)}
</ul></nav>
<button type="button" class="theme" aria-label="Switch the color theme"><span class="theme-icon" aria-hidden="true"></span><span class="theme-label">Auto</span></button>
</div>
</aside>
<main>
${sections.map(sectionHtml).join('')}<footer class="end">Built from docs/help.md. Nothing on this page touched the network.</footer>
</main>
</div>
<a class="top" href="#" aria-label="Back to the top">&uarr;</a>
<script>
{
${script}}
</script>
</body>
</html>
`;
}
