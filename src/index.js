import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { db, migrate } from './db.js';
import { textOn } from './colors.js';
import { startBot } from './bot.js';
import { standings } from './tournament.js';
import { tournamentPdf, rulesPdf } from './pdf.js';

await migrate();
startBot();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(rateLimit({ windowMs: 60000, limit: 120 }));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function safeUrl(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null; } catch { return null; }
}
function safeRules(s) {
  if (!s.rules_html) return esc(s.rules).replaceAll('\n', '<br>');
  return s.rules_html.replace(/href="([^"]*)"/gi, (_, value) => {
    const url = safeUrl(value);
    return url ? `href="${esc(url)}" rel="noopener noreferrer" target="_blank"` : 'href="#"';
  });
}
async function ctx() {
  const settings = (await db.query('SELECT * FROM settings WHERE id=1')).rows[0];
  const sponsors = (await db.query('SELECT * FROM sponsors ORDER BY sort_order,id')).rows;
  if (settings.winner_team_id) settings.winner_name = (await db.query('SELECT name FROM teams WHERE id=$1', [settings.winner_team_id])).rows[0]?.name || '';
  return { settings, sponsors };
}

function shell(s, sponsors, body, active = '') {
  const logo = s.logo ? `<img class="site-logo" src="${s.logo}" alt="Turnierlogo">` : '<div class="site-logo fallback">FTB</div>';
  const sponsorHtml = sponsors.length ? `<footer><div class="wrap"><div class="sponsor-title">Unterstützt von</div><div class="sponsors">${sponsors.map((x) => {
    const inner = x.logo ? `<img src="${x.logo}" alt="${esc(x.name)}"><span>${esc(x.name)}</span>` : `<strong>${esc(x.name)}</strong>`;
    const url = safeUrl(x.url);
    return url ? `<a href="${esc(url)}" rel="noopener noreferrer" target="_blank">${inner}</a>` : `<div>${inner}</div>`;
  }).join('')}</div></div></footer>` : '';
  const pdf = s.tournament_finished && s.winner_team_id ? '<a href="/turnier.pdf">Turnier-PDF</a>' : '';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title)}</title><style>
  :root{--p:${s.primary_color};--a:${s.accent_color};--pt:${textOn(s.primary_color)};--at:${textOn(s.accent_color)}}*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui;background:#f5f7fa;color:#17202a}.ticker{background:#b42318;color:#fff;padding:10px 16px;font-weight:850;text-align:center}header{background:var(--p);color:var(--pt);padding:22px 16px}.wrap{max-width:1100px;margin:auto}.brand{display:flex;gap:16px;align-items:center}.site-logo{width:70px;height:70px;object-fit:contain;background:#fff;border-radius:14px;padding:6px}.site-logo.fallback{display:grid;place-items:center;font-weight:900;color:#111}.title h1{margin:0}.description{margin-top:4px;opacity:.9}.nav{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.nav a{color:inherit;text-decoration:none;font-weight:800;padding:8px 11px;border-radius:8px;background:#ffffff1a}.nav a.active{background:#fff;color:#17202a}.winner{text-align:center;padding:24px;background:var(--a);color:var(--at);font-size:1.3rem;font-weight:800}.winner strong{display:block;font-size:2.3rem}.grid,.tables{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.card,.tablecard,.rules{background:#fff;border:1px solid #dce3ea;border-radius:14px;padding:16px}.game{display:flex;justify-content:space-between;gap:10px}.won{font-weight:900}.meta{color:#64748b;font-size:.9rem;margin-top:8px}main{padding:24px 16px;min-height:55vh}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:460px}th,td{padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center}th:nth-child(2),td:nth-child(2){text-align:left}td img,.teamlogo{width:38px;height:38px;object-fit:contain;vertical-align:middle;margin-right:8px;border-radius:8px}.dq{opacity:.58;text-decoration:line-through}.badge{font-size:.7rem;background:#8b1e1e;color:#fff;border-radius:10px;padding:2px 6px}.rules{white-space:normal}.rules pre{white-space:pre-wrap}.button{display:inline-block;background:var(--p);color:var(--pt);padding:10px 15px;border-radius:9px;text-decoration:none;font-weight:800}.demo{border-style:dashed}.test{font-size:.7rem;font-weight:800;color:#6d28d9}footer{background:#fff;border-top:1px solid #dce3ea;padding:26px 16px;margin-top:24px}.sponsor-title{text-align:center;color:#64748b;font-size:.85rem;margin-bottom:12px}.sponsors{display:flex;justify-content:center;align-items:center;gap:22px;flex-wrap:wrap}.sponsors a,.sponsors>div{display:flex;align-items:center;gap:8px;text-decoration:none;color:#17202a}.sponsors img{max-width:90px;max-height:42px;object-fit:contain}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}@media(max-width:600px){.brand{align-items:flex-start}.site-logo{width:58px;height:58px}.title h1{font-size:1.5rem}}
  </style></head><body>${s.ticker_enabled && s.ticker ? `<div class="ticker">${esc(s.ticker)}</div>` : ''}${s.tournament_finished && s.winner_team_id ? `<div class="winner">Turniersieger<strong>${esc(s.winner_name)}</strong></div>` : ''}<header><div class="wrap"><div class="brand">${logo}<div class="title"><h1>${esc(s.title)}</h1>${s.description ? `<div class="description">${esc(s.description)}</div>` : ''}</div></div><nav class="nav"><a class="${active === 'home' ? 'active' : ''}" href="/">Spielplan</a><a class="${active === 'teams' ? 'active' : ''}" href="/teams">Teams</a><a class="${active === 'rules' ? 'active' : ''}" href="/regelwerk">Regelwerk</a>${pdf}</nav></div></header><main class="wrap">${body}</main>${sponsorHtml}</body></html>`;
}
function table(g) {
  return `<div class="tablecard"><h3>Gruppe ${esc(g.group)}</h3><div class="scroll"><table><thead><tr><th>Platz</th><th>Team</th><th>Spiele</th><th>Siege</th><th>Niederlagen</th></tr></thead><tbody>${g.teams.map((t) => `<tr class="${t.disqualified ? 'dq' : ''}"><td>${t.disqualified ? 'DQ' : `${t.place}.`}</td><td>${t.logo ? `<img src="${t.logo}" alt="">` : ''}<strong>${esc(t.name)}</strong>${t.disqualified ? ' <span class="badge">Disqualifiziert</span>' : ''}</td><td>${t.played}</td><td>${t.wins}</td><td>${t.losses}</td></tr>`).join('')}</tbody></table></div></div>`;
}

app.get('/healthz', (q, r) => r.send('ok'));
app.get('/turnier.pdf', async (q, r) => { try { r.type('pdf').set('Content-Disposition', 'attachment; filename="turnier.pdf"').send(await tournamentPdf()); } catch (e) { if (e.message === 'tournament_not_finished') return r.status(404).send('Der Turnierbericht steht erst nach Festlegung des Siegers bereit.'); throw e; } });
app.get('/regelwerk.pdf', async (q, r) => r.type('pdf').set('Content-Disposition', 'attachment; filename="regelwerk.pdf"').send(await rulesPdf()));
app.get('/', async (q, r) => {
  const { settings: s, sponsors } = await ctx();
  const games = (await db.query(`SELECT g.*,h.name home_name,a.name away_name,w.name winner_name FROM games g JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id LEFT JOIN teams w ON w.id=g.winner_team_id ORDER BY g.is_demo,g.round_no NULLS FIRST,g.slot_no NULLS FIRST,g.id`)).rows;
  const tables = [...await standings(), ...await standings({ demo: true })];
  const body = `<section><h2>Gruppentabellen</h2><div class="tables">${tables.map(table).join('') || '<div class="card">Noch keine Gruppen.</div>'}</div></section><section><h2>Spielplan</h2><div class="grid">${games.map((g) => `<div class="card ${g.is_demo ? 'demo' : ''}">${g.is_demo ? '<div class="test">TESTDATEN</div>' : ''}<div class="game"><span class="${g.winner_team_id === g.home_team_id ? 'won' : ''}">${esc(g.home_name)}</span><strong>vs.</strong><span class="${g.winner_team_id === g.away_team_id ? 'won' : ''}">${esc(g.away_name)}</span></div><div class="meta">${esc(g.round_label || g.group_name || g.phase)}${g.winner_name ? ` · Sieger: ${esc(g.winner_name)}` : g.status === 'live' ? ' · läuft' : ''}</div></div>`).join('') || '<div class="card">Noch keine Spiele.</div>'}</div></section>`;
  r.send(shell(s, sponsors, body, 'home'));
});
app.get('/teams', async (q, r) => {
  const { settings: s, sponsors } = await ctx();
  const teams = (await db.query('SELECT * FROM teams ORDER BY is_demo,group_name NULLS LAST,name')).rows;
  const body = `<h2>Teams</h2><div class="grid">${teams.map((t) => `<div class="card ${t.disqualified ? 'dq' : ''}">${t.logo ? `<img class="teamlogo" src="${t.logo}" alt="${esc(t.name)}">` : ''}<strong>${esc(t.name)}</strong><div>Gruppe ${esc(t.group_name || '–')} ${t.disqualified ? '<span class="badge">Disqualifiziert</span>' : ''}</div>${t.is_demo ? '<div class="test">TESTDATEN</div>' : ''}</div>`).join('') || '<div class="card">Noch keine Teams.</div>'}</div>`;
  r.send(shell(s, sponsors, body, 'teams'));
});
app.get('/regelwerk', async (q, r) => {
  const { settings: s, sponsors } = await ctx();
  const body = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><h2>Regelwerk</h2><a class="button" href="/regelwerk.pdf">Regelwerk als PDF herunterladen</a></div><div class="rules">${safeRules(s) || 'Das Regelwerk wird noch veröffentlicht.'}</div>`;
  r.send(shell(s, sponsors, body, 'rules'));
});
app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
