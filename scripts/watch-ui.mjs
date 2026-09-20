// Local, read-only view of what the X watcher did: npm run watch:ui  [-- --port 4322]
// Reads .scratch/watch-runs.jsonl (written by every `npm run watch` pass, dry runs included) and
// .scratch/watch-state.json. Sends nothing anywhere; binds to 127.0.0.1 only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { USEFUL_KINDS } from '../api/_lib/relevance.ts';

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 4322;
const scratch = new URL('../.scratch/', import.meta.url);

async function data() {
  const raw = await readFile(new URL('watch-runs.jsonl', scratch), 'utf8').catch(() => '');
  const lines = raw.split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return []; // a pass that was killed mid-write leaves a partial last line
    }
  });
  const state = JSON.parse(await readFile(new URL('watch-state.json', scratch), 'utf8').catch(() => '{}'));
  const config = JSON.parse(await readFile(new URL('./watch-queries.json', import.meta.url), 'utf8'));
  return {
    passes: lines.filter((l) => l.type === 'pass').reverse(),
    posts: lines.filter((l) => l.type === 'post'),
    backlog: state.retry ?? [],
    sinceId: state.sinceId ?? {},
    queries: config.queries,
    usefulKinds: USEFUL_KINDS,
  };
}

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Jev watcher</title>
<style>
  :root {
    --bg: #f6f5f1; --panel: #fff; --ink: #1d1c1a; --muted: #6d6a63; --line: #e3e0d8;
    --published: #1f8a4c; --pull_request: #2f6fde; --backlog: #c98a0b; --held: #9a968c; --rejected: #c8453a; --error: #a23bb5; --refused: #6b7a8f;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #161513; --panel: #201f1c; --ink: #ece9e2; --muted: #9c988e; --line: #34322d; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 1180px; margin: 0 auto; padding: 20px 16px 60px; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0 auto 0 0; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 10px; }
  select, input, button { font: inherit; color: inherit; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; }
  button { cursor: pointer; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(12, 1fr); }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px; grid-column: span 12; min-width: 0; }
  @media (min-width: 900px) { .half { grid-column: span 6; } }
  .badge { font-size: 11px; padding: 2px 7px; border-radius: 99px; border: 1px solid var(--line); color: var(--muted); }
  .badge.dry { color: var(--backlog); border-color: var(--backlog); }
  .muted { color: var(--muted); }
  .num { font-variant-numeric: tabular-nums; }

  .funnel { display: flex; flex-wrap: wrap; align-items: stretch; gap: 6px; }
  .stage { flex: 1 1 110px; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .stage b { display: block; font-size: 22px; font-variant-numeric: tabular-nums; }
  .stage span { color: var(--muted); font-size: 12px; }
  .arrow { align-self: center; color: var(--muted); }
  .bar { display: flex; height: 14px; border-radius: 4px; overflow: hidden; margin-top: 12px; background: var(--line); }
  .bar i { display: block; height: 100%; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; font-size: 12px; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; }

  .hist { position: relative; height: 150px; display: flex; align-items: flex-end; gap: 2px; border-bottom: 1px solid var(--line); }
  .hist .col { flex: 1; display: flex; flex-direction: column-reverse; height: 100%; }
  .hist .col i { display: block; width: 100%; }
  .mark { position: absolute; top: 0; bottom: 0; border-left: 1.5px dashed var(--ink); opacity: 0.55; }
  .mark em { position: absolute; top: -2px; left: 4px; font-size: 10.5px; font-style: normal; white-space: nowrap; background: var(--panel); padding: 0 3px; border-radius: 3px; }
  .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 3px; }
  .whatif { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 12px; font-size: 13px; }
  .whatif input[type='range'] { flex: 1 1 160px; padding: 0; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  td { padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr.row { cursor: pointer; }
  tr.row:hover td { background: color-mix(in srgb, var(--ink) 4%, transparent); }
  td.text { max-width: 0; width: 55%; }
  td.text div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 99px; color: #fff; white-space: nowrap; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .filters input[type='search'] { flex: 1 1 180px; }
  .scroll { overflow-x: auto; }

  .detail td { background: color-mix(in srgb, var(--ink) 3%, transparent); }
  .detail .body { display: grid; gap: 16px; grid-template-columns: 1fr; }
  @media (min-width: 800px) { .detail .body { grid-template-columns: 1.2fr 1fr; } }
  .quote { white-space: pre-wrap; overflow-wrap: anywhere; border-left: 3px solid var(--line); padding-left: 10px; margin: 0 0 8px; }
  .sig { display: grid; grid-template-columns: 130px 1fr 40px; gap: 8px; align-items: center; font-size: 12.5px; margin-bottom: 5px; }
  .sig .track { height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
  .sig .track i { display: block; height: 100%; background: var(--pull_request); }
  .sig .track i.bad { background: var(--rejected); }
  a { color: var(--pull_request); }
  .empty { padding: 40px 10px; text-align: center; color: var(--muted); }
  code { font: 12.5px ui-monospace, monospace; background: color-mix(in srgb, var(--ink) 7%, transparent); padding: 1px 5px; border-radius: 4px; }
</style>
<main>
  <header>
    <h1>Jev watcher</h1>
    <span id="badges"></span>
    <select id="pass" aria-label="Pass"></select>
    <button id="reload" title="Re-read the run log">Reload</button>
  </header>
  <div id="app" class="grid"></div>
</main>
<script>
(async () => {
  const OUTCOMES = { published: 'Published', pull_request: 'Pull request', backlog: 'Backlog', held: 'Not worth a review', rejected: 'Rejected', refused: 'Refused by site', error: 'Error' };
  // Tweets are untrusted text: everything rendered goes through esc().
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (id) => document.getElementById(id);
  const pct = (n, d) => (d ? Math.round((100 * n) / d) + '%' : '–');
  const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  let D, view = { pass: '', outcome: '', kind: '', topic: '', q: '', open: null, floor: null, sort: 'score' };

  async function load() {
    D = await (await fetch('/data')).json();
    if (!D.passes.some((p) => p.pass === view.pass)) view.pass = D.passes[0]?.pass ?? '';
    $('pass').innerHTML = D.passes.map((p) => '<option value="' + esc(p.pass) + '">' + esc(when(p.pass)) + (p.dryRun ? ' · dry run' : '') + ' · ' + D.posts.filter((x) => x.pass === p.pass).length + ' posts</option>').join('');
    $('pass').value = view.pass;
    $('pass').hidden = !D.passes.length;
    render();
  }

  function render() {
    const pass = D.passes.find((p) => p.pass === view.pass);
    if (!pass) {
      $('badges').innerHTML = '';
      $('app').innerHTML = '<div class="panel empty">No passes recorded yet. Run <code>npm run watch -- --dry-run</code>, then press Reload.</div>';
      return;
    }
    const posts = D.posts.filter((p) => p.pass === pass.pass);
    const S = pass.settings;
    if (view.floor === null) view.floor = S.reviewFloor;
    $('badges').innerHTML = (pass.dryRun ? '<span class="badge dry">dry run: nothing was sent</span> ' : '') + (pass.prOnly ? '<span class="badge">pull requests only</span> ' : '') +
      '<span class="badge">caps ' + S.maxPublish + ' publish / ' + S.maxReview + ' PR</span>';

    const by = (o) => posts.filter((p) => p.outcome === o).length;
    const read = pass.searches.reduce((n, s) => n + s.found, 0);
    const verdict = (v) => posts.filter((p) => p.rank?.verdict === v).length;
    const stage = (n, label) => '<div class="stage"><b>' + n + '</b><span>' + label + '</span></div>';
    const funnel = [stage(read, 'posts read from X (billed)'), stage(posts.length + pass.counts.skipped, 'unique'), stage(posts.length, 'ranked by Jev'), stage(verdict('publish'), 'verdict: publish'), stage(by('published') + by('pull_request'), pass.dryRun ? 'would be sent' : 'sent to the site')].join('<span class="arrow">→</span>');
    const bar = Object.keys(OUTCOMES).map((o) => '<i style="width:' + (100 * by(o)) / (posts.length || 1) + '%;background:var(--' + o + ')" title="' + OUTCOMES[o] + ': ' + by(o) + '"></i>').join('');
    const legend = Object.keys(OUTCOMES).filter(by).map((o) => '<span><span class="dot" style="background:var(--' + o + ')"></span>' + OUTCOMES[o] + ' <b class="num">' + by(o) + '</b></span>').join('');

    // Histogram of composite scores, stacked by what happened to the post.
    const BINS = 25, bins = Array.from({ length: BINS }, () => ({}));
    for (const p of posts) if (p.rank) { const b = bins[Math.min(BINS - 1, Math.floor(p.rank.score * BINS))]; b[p.outcome] = (b[p.outcome] ?? 0) + 1; }
    const tallest = Math.max(1, ...bins.map((b) => Object.values(b).reduce((a, c) => a + c, 0)));
    const hist = bins.map((b, i) => '<div class="col" title="' + (i / BINS).toFixed(2) + '–' + ((i + 1) / BINS).toFixed(2) + '">' + Object.keys(OUTCOMES).map((o) => (b[o] ? '<i style="height:' + (100 * b[o]) / tallest + '%;background:var(--' + o + ')"></i>' : '')).join('') + '</div>').join('');
    const mark = (x, label) => '<div class="mark" style="left:' + x * 100 + '%"><em>' + label + '</em></div>';
    const prNow = posts.filter((p) => p.rank?.verdict === 'review' && p.rank.score >= S.reviewFloor && D.usefulKinds.includes(p.rank.kind)).length;
    const prIf = posts.filter((p) => p.rank?.verdict === 'review' && p.rank.score >= view.floor && D.usefulKinds.includes(p.rank.kind)).length;

    // Which queries earn their X credits.
    const yieldRows = pass.searches.map((s) => {
      const mine = posts.filter((p) => p.topics.includes(s.topic));
      const good = mine.filter((p) => p.rank?.verdict === 'publish').length;
      const only = mine.filter((p) => p.topics.length === 1).length;
      return '<tr><td>' + esc(s.topic) + '</td><td class="num">' + s.found + '</td><td class="num">' + only + '</td><td class="num">' + good + '</td><td class="num">' + pct(good, s.found) + '</td><td class="num">' + mine.filter((p) => p.outcome === 'rejected').length + '</td></tr>';
    }).join('');

    const kinds = [...new Set(posts.map((p) => p.rank?.kind).filter(Boolean))].sort();
    const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
    const q = view.q.toLowerCase();
    const shown = posts
      .filter((p) => (!view.outcome || p.outcome === view.outcome) && (!view.kind || p.rank?.kind === view.kind) && (!view.topic || p.topics.includes(view.topic)) && (!q || (p.text + ' ' + p.authorHandle + ' ' + p.authorName).toLowerCase().includes(q)))
      .sort((a, b) => (view.sort === 'score' ? (b.rank?.score ?? -1) - (a.rank?.score ?? -1) : b.id.localeCompare(a.id)));
    const sig = (label, v, bad) => '<div class="sig"><span>' + label + '</span><span class="track"><i class="' + (bad ? 'bad' : '') + '" style="width:' + Math.round((v ?? 0) * 100) + '%"></i></span><span class="num">' + (v ?? 0).toFixed(2) + '</span></div>';
    const rows = shown.map((p) => {
      const r = p.rank, s = r?.signals;
      let html = '<tr class="row" data-id="' + esc(p.id) + '"><td class="num">' + (r ? r.score.toFixed(2) : '–') + '</td><td><span class="pill" style="background:var(--' + p.outcome + ')">' + OUTCOMES[p.outcome] + '</span></td><td>' + esc(r?.kind ?? '') + '</td><td>@' + esc(p.authorHandle) + '</td><td class="text"><div>' + esc(p.text) + '</div></td></tr>';
      if (view.open === p.id) html += '<tr class="detail"><td colspan="5"><div class="body"><div><p class="quote">' + esc(p.text) + '</p><p><a href="' + esc(p.url) + '" target="_blank" rel="noreferrer noopener">Open on X</a> · ' + esc(p.authorName) + ' · found by ' + esc(p.topics.join(', ')) + '</p>' + (p.card?.title ? '<p><b>' + esc(p.card.title) + '</b>' + (p.card.summary ? '<br><span class="muted">' + esc(p.card.summary) + '</span>' : '') + '</p>' : '') + (p.card ? '<p>' + (p.media ? '<span class="badge">' + esc(p.media.type) + ' preview</span> ' : '') + '<span class="badge">' + esc(p.card.category ?? 'no category') + '</span> ' + [...p.card.useCases, ...p.card.primitives].map((u) => '<span class="badge">' + esc(u) + '</span> ').join('') + (p.card.confidence ? '<span class="muted">confidence ' + p.card.confidence.category.toFixed(2) + ' / ' + p.card.confidence.useCase.toFixed(2) + '</span>' : '') + '</p>' : '') + '<p class="muted">Jev verdict <b>' + esc(r?.verdict ?? 'none') + '</b>: ' + esc(r?.reasons ?? p.detail ?? '') + (p.detail && r ? '<br>' + esc(p.detail) : '') + '</p></div><div>' +
        (s ? sig('About the Jev model', s.aboutJevModel) + sig('Usage depth', s.usageDepth) + sig('↳ confidence', s.usageConfidence) + sig('First-hand', s.firstHand) + sig('Kind confidence', s.kindConfidence) + sig('Spam', s.isSpam, true) + '<p class="muted">Mentions Jev or TypeSafe in the text: ' + (s.keywordHit ? 'yes' : 'no') + '</p>' : '<p class="muted">Ranked in an earlier version of the watcher; signals were not recorded.</p>') + '</div></div></td></tr>';
      return html;
    }).join('');

    const history = D.passes.slice(0, 30).map((p) => '<tr><td>' + esc(when(p.pass)) + (p.dryRun ? ' <span class="badge dry">dry</span>' : '') + '</td><td class="num">' + p.searches.reduce((n, s) => n + s.found, 0) + '</td><td class="num">' + p.counts.publish + '</td><td class="num">' + p.counts.review + '</td><td class="num">' + p.counts.waiting + '</td><td class="num">' + p.counts.reject + '</td><td class="num">' + p.counts.error + '</td><td class="num">$' + ((p.tokens * 0.042) / 1e6).toFixed(4) + '</td></tr>').join('');
    const backlog = [...D.backlog].sort((a, b) => (b.rank?.score ?? 0) - (a.rank?.score ?? 0)).map((p) => '<tr><td class="num">' + (p.rank ? p.rank.score.toFixed(2) : '–') + '</td><td>' + esc(p.rank?.verdict ?? 'unranked') + '</td><td><a href="' + esc(p.url) + '" target="_blank" rel="noreferrer noopener">@' + esc(p.authorHandle) + '</a></td><td class="text"><div>' + esc(p.text) + '</div></td></tr>').join('');

    $('app').innerHTML =
      '<section class="panel"><h2>Pipeline · ' + esc(when(pass.pass)) + '</h2><div class="funnel">' + funnel + '</div><div class="bar">' + bar + '</div><div class="legend">' + legend + '<span class="muted">' + pass.counts.skipped + ' already known · Jev cost $' + ((pass.tokens * 0.042) / 1e6).toFixed(4) + '</span></div></section>' +
      '<section class="panel half"><h2>Score distribution</h2><div class="hist">' + hist + mark(S.review, 'reject < ' + S.review) + mark(view.floor, 'PR ≥ ' + Number(view.floor).toFixed(2)) + (Math.abs(S.publish - view.floor) > 0.02 ? mark(S.publish, 'publish ≥ ' + S.publish) : '') + '</div><div class="axis"><span>0</span><span>0.5</span><span>1</span></div>' +
        '<div class="whatif"><label for="floor">What if the review floor were</label><input id="floor" type="range" min="0.4" max="1" step="0.01" value="' + view.floor + '" /><span><b class="num">' + prIf + '</b> pull-request candidates <span class="muted">(' + prNow + ' at ' + S.reviewFloor + ')</span></span></div><p class="muted" style="margin:8px 0 0">Useful kinds only. Apply with <code>--review-floor ' + Number(view.floor).toFixed(2) + '</code>. Publish verdicts also pass gates the score alone does not show.</p></section>' +
      '<section class="panel half"><h2>Query yield</h2><div class="scroll"><table><tr><th>Query</th><th>Read</th><th>Only here</th><th>Publish verdicts</th><th>Yield</th><th>Rejected</th></tr>' + yieldRows + '</table></div><p class="muted" style="margin:8px 0 0">X bills every post read, per query. A low “only here” means another query already finds these posts.</p></section>' +
      '<section class="panel"><h2>Posts · ' + shown.length + ' of ' + posts.length + '</h2><div class="filters"><input id="q" type="search" placeholder="Search text or author" value="' + esc(view.q) + '" />' +
        '<select id="f-outcome">' + opt('', 'All outcomes', view.outcome) + Object.keys(OUTCOMES).filter(by).map((o) => opt(o, OUTCOMES[o], view.outcome)).join('') + '</select>' +
        '<select id="f-kind">' + opt('', 'All kinds', view.kind) + kinds.map((k) => opt(k, k, view.kind)).join('') + '</select>' +
        '<select id="f-topic">' + opt('', 'All queries', view.topic) + pass.searches.map((s) => opt(s.topic, s.topic, view.topic)).join('') + '</select>' +
        '<select id="f-sort">' + opt('score', 'Best score first', view.sort) + opt('new', 'Newest first', view.sort) + '</select></div>' +
        (shown.length ? '<div class="scroll"><table><tr><th>Score</th><th>Outcome</th><th>Kind</th><th>Author</th><th>Text</th></tr>' + rows + '</table></div>' : '<div class="empty">No posts match these filters.</div>') + '</section>' +
      '<section class="panel half"><h2>Backlog now · ' + D.backlog.length + '</h2>' + (backlog ? '<div class="scroll"><table><tr><th>Score</th><th>Verdict</th><th>Author</th><th>Text</th></tr>' + backlog + '</table></div>' : '<p class="muted">Empty. Posts over the per-pass caps wait here, best first, until they are sent or age out of X’s 7-day window.</p>') + '</section>' +
      '<section class="panel half"><h2>Passes</h2><div class="scroll"><table><tr><th>When</th><th>Read</th><th>Published</th><th>PRs</th><th>Waiting</th><th>Rejected</th><th>Errors</th><th>Jev</th></tr>' + history + '</table></div></section>';

    const bind = (id, key, ev) => $(id)?.addEventListener(ev ?? 'change', (e) => { view[key] = e.target.value; render(); if (ev === 'input') { const el = $(id); el.focus(); if (el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); } });
    bind('q', 'q', 'input'); bind('floor', 'floor', 'input'); bind('f-outcome', 'outcome'); bind('f-kind', 'kind'); bind('f-topic', 'topic'); bind('f-sort', 'sort');
    document.querySelectorAll('tr.row').forEach((tr) => tr.addEventListener('click', () => { view.open = view.open === tr.dataset.id ? null : tr.dataset.id; render(); }));
  }

  $('pass').addEventListener('change', (e) => { view.pass = e.target.value; view.open = null; view.floor = null; render(); });
  $('reload').addEventListener('click', load);
  load();
})();
</script>
</html>`;

createServer(async (req, res) => {
  if (req.url === '/data') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(await data()));
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self' 'unsafe-inline'" });
    res.end(PAGE);
  } else {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Jev watcher: http://localhost:${port}  (Ctrl+C to stop)`));
