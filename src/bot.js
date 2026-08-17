import TelegramBot from 'node-telegram-bot-api';
import { db, audit, acquireLock, releaseLock } from './db.js';
import { validatePalette } from './colors.js';
import {
  assignGroups, createGroupGames, seedDemo, clearDemo, qualificationPlan,
  createKnockout, advanceKnockout, setTieOrder,
} from './tournament.js';

const admins = new Set((process.env.TELEGRAM_ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean));
const states = new Map();
const kb = (inline_keyboard) => ({ reply_markup: { inline_keyboard } });
const mainMenu = kb([
  [{ text: '🖥 Seite verwalten', callback_data: 'page' }],
  [{ text: '👥 Teams & Gruppen', callback_data: 'teams' }, { text: '🏆 Spiele', callback_data: 'games' }],
  [{ text: '🌳 K.-o.-Phase', callback_data: 'ko' }],
]);
const pageMenu = kb([
  [{ text: '🎨 Farben / Branding', callback_data: 'page_branding' }, { text: '🖼 Seitenlogo', callback_data: 'page_logo' }],
  [{ text: '📝 Texte verwalten', callback_data: 'page_texts' }],
  [{ text: '🤝 Sponsoren', callback_data: 'page_sponsors' }],
  [{ text: '🧪 Testdaten', callback_data: 'page_demo' }],
  [{ text: '⬅️ Hauptmenü', callback_data: 'main' }],
]);
const textMenu = kb([
  [{ text: '🏷 Seitentitel', callback_data: 'text_title' }, { text: '💬 Beschreibung', callback_data: 'text_description' }],
  [{ text: '📢 Laufbanner', callback_data: 'text_ticker' }, { text: '📜 Regelwerk', callback_data: 'text_rules' }],
  [{ text: '⬅️ Seite verwalten', callback_data: 'page' }],
]);

async function begin(bot, chat, id, scope, state, text, options) {
  const l = await acquireLock(scope, id);
  if (!l.ok) return bot.sendMessage(chat, '⚠️ Ein anderer Administrator bearbeitet diesen Bereich gerade.');
  states.set(id, { ...state, scope });
  return bot.sendMessage(chat, text, options);
}
async function done(id) {
  const s = states.get(id);
  if (s?.scope) await releaseLock(s.scope, id);
  states.delete(id);
}
async function photo(bot, m) {
  const p = m.photo?.at(-1);
  if (!p) return null;
  const r = await fetch(await bot.getFileLink(p.file_id));
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length > 2e6) throw Error('large');
  return `data:image/jpeg;base64,${b.toString('base64')}`;
}
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escAttr = (s) => escHtml(s).replaceAll('`', '&#96;');

function entityTags(e) {
  if (e.type === 'bold') return ['<strong>', '</strong>'];
  if (e.type === 'italic') return ['<em>', '</em>'];
  if (e.type === 'underline') return ['<u>', '</u>'];
  if (e.type === 'strikethrough') return ['<s>', '</s>'];
  if (e.type === 'code') return ['<code>', '</code>'];
  if (e.type === 'pre') return ['<pre>', '</pre>'];
  if (e.type === 'text_link' && e.url) return [`<a href="${escAttr(e.url)}">`, '</a>'];
  return ['', ''];
}
function telegramToHtml(text, entities = []) {
  const opens = new Map();
  const closes = new Map();
  for (const e of entities) {
    const [open, close] = entityTags(e);
    if (!open) continue;
    if (!opens.has(e.offset)) opens.set(e.offset, []);
    if (!closes.has(e.offset + e.length)) closes.set(e.offset + e.length, []);
    opens.get(e.offset).push({ ...e, tag: open });
    closes.get(e.offset + e.length).push({ ...e, tag: close });
  }
  let out = '';
  for (let i = 0; i <= text.length; i += 1) {
    for (const e of (closes.get(i) || []).sort((a, b) => b.offset - a.offset)) out += e.tag;
    for (const e of (opens.get(i) || []).sort((a, b) => b.length - a.length)) out += e.tag;
    if (i < text.length) out += escHtml(text[i]);
  }
  return out.replaceAll('\n', '<br>');
}

export function startBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
  const ok = (m, u = m.from) => m.chat?.type === 'private' && admins.has(String(u?.id));
  const home = (chat, text = 'FTB Administration') => bot.sendMessage(chat, text, mainMenu);

  bot.onText(/\/start/, (m) => ok(m) ? home(m.chat.id) : bot.sendMessage(m.chat.id, 'Kein Zugriff.'));

  bot.on('callback_query', async (q) => {
    const m = q.message; const id = q.from.id; const d = q.data;
    if (!ok(m, q.from)) return;
    await bot.answerCallbackQuery(q.id);
    try {
      if (d === 'main') return home(m.chat.id);
      if (d === 'page') return bot.sendMessage(m.chat.id, 'Seite verwalten', pageMenu);
      if (d === 'page_texts') return bot.sendMessage(m.chat.id, 'Texte verwalten', textMenu);
      if (d === 'page_branding') return begin(bot, m.chat.id, id, 'page', { step: 'colors' }, 'Bis zu 3 HEX-Farben senden, z. B. #9B1C1C #FFFFFF #111111:');
      if (d === 'page_logo') return begin(bot, m.chat.id, id, 'page', { step: 'site_logo' }, 'Neues Seitenlogo als Foto senden. Mit /remove wird das Logo entfernt.');
      if (d === 'text_title') return begin(bot, m.chat.id, id, 'page', { step: 'title' }, 'Neuen Seitentitel senden:');
      if (d === 'text_description') return begin(bot, m.chat.id, id, 'page', { step: 'description' }, 'Optionale kurze Beschreibung senden. Mit /remove wird sie entfernt:');
      if (d === 'text_ticker') return begin(bot, m.chat.id, id, 'page', { step: 'ticker' }, 'Laufbanner senden. „aus“ deaktiviert es:');
      if (d === 'text_rules') return begin(bot, m.chat.id, id, 'rules', { step: 'rules_collect', html: [], plain: [] }, 'Regelwerk als Telegram-Text senden. Fett, kursiv, unterstrichen, durchgestrichen, Code und Links werden übernommen. Bei langen Regeln einfach mehrere Nachrichten senden. Danach „Regelwerk speichern“ drücken.');
      if (d === 'rules_save') {
        const s = states.get(id);
        if (!s || s.step !== 'rules_collect') return bot.sendMessage(m.chat.id, 'Keine laufende Regelbearbeitung.');
        await db.query('UPDATE settings SET rules=$1,rules_html=$2,version=version+1 WHERE id=1', [s.plain.join('\n\n').slice(0, 60000), s.html.join('<br><br>').slice(0, 120000)]);
        await audit(id, 'rules.update', { messages: s.plain.length });
        await done(id);
        return bot.sendMessage(m.chat.id, 'Regelwerk gespeichert.', pageMenu);
      }
      if (d === 'rules_cancel') { await done(id); return bot.sendMessage(m.chat.id, 'Regelbearbeitung verworfen.', pageMenu); }

      if (d === 'page_demo') return bot.sendMessage(m.chat.id, 'Testdaten', kb([[{ text: 'Erstellen', callback_data: 'demo_seed' }, { text: 'Löschen', callback_data: 'demo_clear' }], [{ text: '⬅️ Seite verwalten', callback_data: 'page' }]]));
      if (d === 'demo_seed') { await seedDemo(); return bot.sendMessage(m.chat.id, 'Testdaten erstellt.', pageMenu); }
      if (d === 'demo_clear') { await clearDemo(); return bot.sendMessage(m.chat.id, 'Testdaten gelöscht. Seiteneinstellungen bleiben erhalten.', pageMenu); }

      if (d === 'page_sponsors') return showSponsors(bot, m.chat.id);
      if (d === 'sponsor_add') return begin(bot, m.chat.id, id, 'sponsors', { step: 'sponsor_name' }, 'Name des Sponsors:');
      if (d.startsWith('sponsor:')) {
        const sponsorId = +d.split(':')[1];
        const s = (await db.query('SELECT * FROM sponsors WHERE id=$1', [sponsorId])).rows[0];
        if (!s) return showSponsors(bot, m.chat.id);
        return bot.sendMessage(m.chat.id, `Sponsor: ${s.name}`, kb([[{ text: '🗑 Entfernen', callback_data: `sponsor_delete:${s.id}` }], [{ text: '⬅️ Sponsoren', callback_data: 'page_sponsors' }]]));
      }
      if (d.startsWith('sponsor_delete:')) {
        const l = await acquireLock('sponsors', id); if (!l.ok) return bot.sendMessage(m.chat.id, '⚠️ Sponsoren werden gerade bearbeitet.');
        await db.query('DELETE FROM sponsors WHERE id=$1', [+d.split(':')[1]]); await releaseLock('sponsors', id);
        return showSponsors(bot, m.chat.id);
      }

      if (d === 'teams') return showTeams(bot, m.chat.id);
      if (d === 'team_add') return begin(bot, m.chat.id, id, 'teams', { step: 'team_name' }, 'Teamname:');
      if (d === 'team_manage') return chooseTeam(bot, m.chat.id, 'Team verwalten:', 'tm:');
      if (d.startsWith('tm:')) return teamManage(bot, m.chat.id, +d.split(':')[1]);
      if (d.startsWith('team_dq:')) {
        const teamId = +d.split(':')[1]; const l = await acquireLock('teams', id); if (!l.ok) return bot.sendMessage(m.chat.id, '⚠️ Teams werden gerade bearbeitet.');
        await db.query('UPDATE teams SET disqualified=NOT disqualified,version=version+1 WHERE id=$1', [teamId]); await releaseLock('teams', id);
        return teamManage(bot, m.chat.id, teamId);
      }
      if (d.startsWith('team_group:')) return begin(bot, m.chat.id, id, 'teams', { step: 'manual_group', teamId: +d.split(':')[1] }, 'Neue Gruppe, „-“ für keine:');
      if (d.startsWith('team_logo:')) return begin(bot, m.chat.id, id, 'teams', { step: 'team_logo_edit', teamId: +d.split(':')[1] }, 'Neues Teamlogo als Foto senden. /remove entfernt es.');
      if (d === 'groups_auto') return begin(bot, m.chat.id, id, 'teams', { step: 'group_count' }, 'Anzahl Gruppen, 1 bis 26:');
      if (d === 'groups_manual') return chooseTeam(bot, m.chat.id, 'Team für Gruppenzuordnung wählen:', 'team_group:');
      if (d === 'groups_games') {
        const l = await acquireLock('games', id); if (!l.ok) return bot.sendMessage(m.chat.id, '⚠️ Spiele werden gerade bearbeitet.');
        try { const result = await createGroupGames(); await audit(id, 'group_games.create', result); return bot.sendMessage(m.chat.id, `${result.games} Gruppenspiele in ${result.groups} Gruppen erstellt.`, mainMenu); }
        catch (e) { if (e.message === 'group_games_exist') return bot.sendMessage(m.chat.id, 'Es existieren bereits Gruppenspiele. Bestehende Ergebnisse werden nicht überschrieben.', mainMenu); throw e; }
        finally { await releaseLock('games', id); }
      }

      if (d === 'games') return showGames(bot, m.chat.id);
      if (d.startsWith('res:')) {
        const gameId = +d.split(':')[1];
        const g = (await db.query(`SELECT g.version,h.id hid,h.name home,a.id aid,a.name away FROM games g JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id WHERE g.id=$1`, [gameId])).rows[0];
        if (!g) return;
        const l = await acquireLock(`game:${gameId}`, id); if (!l.ok) return bot.sendMessage(m.chat.id, '⚠️ Dieses Spiel wird gerade bearbeitet.');
        states.set(id, { scope: `game:${gameId}`, step: 'winner', gameId, version: g.version });
        return bot.sendMessage(m.chat.id, 'Sieger wählen:', kb([[{ text: `🏆 ${g.home}`, callback_data: `win:${gameId}:${g.hid}:${g.version}` }], [{ text: `🏆 ${g.away}`, callback_data: `win:${gameId}:${g.aid}:${g.version}` }], [{ text: 'Spiel läuft', callback_data: `live:${gameId}:${g.version}` }, { text: 'Absagen', callback_data: `cancel:${gameId}:${g.version}` }]]));
      }
      if (d.startsWith('win:') || d.startsWith('live:') || d.startsWith('cancel:')) {
        const x = d.split(':'); const gameId = +x[1]; const isWin = d.startsWith('win:'); const version = +(isWin ? x[3] : x[2]); const winner = isWin ? +x[2] : null;
        const r = isWin
          ? await db.query("UPDATE games SET winner_team_id=$1,status='finished',version=version+1 WHERE id=$2 AND version=$3 RETURNING id", [winner, gameId, version])
          : await db.query('UPDATE games SET status=$1,winner_team_id=NULL,version=version+1 WHERE id=$2 AND version=$3 RETURNING id', [d.startsWith('live:') ? 'live' : 'cancelled', gameId, version]);
        await done(id);
        if (!r.rowCount) return bot.sendMessage(m.chat.id, '⚠️ Spiel wurde zwischenzeitlich geändert. Bitte neu öffnen.', mainMenu);
        if (isWin) { const progress = await advanceKnockout(gameId); if (progress.finished) await audit(id, 'tournament.finish', { winnerTeamId: progress.winnerTeamId }); }
        return bot.sendMessage(m.chat.id, 'Spiel aktualisiert.', mainMenu);
      }

      if (d === 'ko') {
        const p = await qualificationPlan();
        if (!p.size) return bot.sendMessage(m.chat.id, 'Noch nicht genug Teams für eine K.-o.-Phase.');
        if (p.unresolved.length) return bot.sendMessage(m.chat.id, '⚖️ Vor der K.-o.-Phase müssen Gleichstände entschieden werden.', kb(p.unresolved.map((x) => [{ text: `Gruppe ${x.group}: ${x.teams.map((t) => t.name).join(' / ')}`, callback_data: `tie:${x.group}` }])));
        return bot.sendMessage(m.chat.id, `Empfehlung: ${p.size}er K.-o.-Runde.\nQualifiziert: ${p.qualified.map((x) => x.name).join(', ')}\n\nFinalmodus:`, kb([[{ text: '1 Entscheidungsspiel', callback_data: 'ko_single' }], [{ text: 'Best of Three', callback_data: 'ko_bo3' }]]));
      }
      if (d.startsWith('tie:')) {
        const group = d.slice(4); const p = await qualificationPlan(); const tie = p.unresolved.find((x) => x.group === group); if (!tie) return bot.sendMessage(m.chat.id, 'Kein offener Gleichstand.', mainMenu);
        return begin(bot, m.chat.id, id, 'knockout', { step: 'tie_order', group, allowedIds: tie.teams.map((t) => t.id) }, `Reihenfolge festlegen. IDs von oben nach unten, Komma getrennt:\n${tie.teams.map((t) => `${t.id}: ${t.name}`).join('\n')}`);
      }
      if (d === 'ko_single' || d === 'ko_bo3') {
        const mode = d === 'ko_bo3' ? 'bo3' : 'single'; const l = await acquireLock('knockout', id); if (!l.ok) return bot.sendMessage(m.chat.id, '⚠️ K.-o.-Phase wird gerade bearbeitet.');
        try { const p = await createKnockout(mode); await audit(id, 'knockout.create', { size: p.size, finalMode: mode }); return bot.sendMessage(m.chat.id, `${p.size}er K.-o.-Phase erstellt.`, mainMenu); }
        finally { await releaseLock('knockout', id); }
      }
    } catch (e) {
      await done(id); console.error(e); return bot.sendMessage(m.chat.id, 'Aktion fehlgeschlagen.', mainMenu);
    }
  });

  bot.on('message', async (m) => {
    if (m.text?.startsWith('/start') || !ok(m)) return;
    const s = states.get(m.from.id); if (!s) return;
    const t = (m.text || '').trim();
    try {
      if (s.step === 'rules_collect') {
        if (!m.text) return bot.sendMessage(m.chat.id, 'Für das Regelwerk bitte Textnachrichten verwenden.');
        s.plain.push(m.text); s.html.push(telegramToHtml(m.text, m.entities || []));
        return bot.sendMessage(m.chat.id, `Regelteil ${s.plain.length} übernommen. Weitere Nachricht senden oder speichern.`, kb([[{ text: '✅ Regelwerk speichern', callback_data: 'rules_save' }], [{ text: '❌ Verwerfen', callback_data: 'rules_cancel' }]]));
      }
      if (s.step === 'colors') {
        const c = t.split(/\s+/); while (c.length < 3) c.push(c.length === 1 ? '#FFFFFF' : '#F4B942');
        const v = validatePalette(...c.slice(0, 3)); if (!v.ok) return bot.sendMessage(m.chat.id, v.error);
        await db.query('UPDATE settings SET primary_color=$1,secondary_color=$2,accent_color=$3,version=version+1 WHERE id=1', v.colors); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Branding gespeichert.', pageMenu);
      }
      if (s.step === 'site_logo') {
        const logo = t === '/remove' ? null : await photo(bot, m); if (t !== '/remove' && !logo) return bot.sendMessage(m.chat.id, 'Bitte ein Foto senden oder /remove.');
        await db.query('UPDATE settings SET logo=$1,version=version+1 WHERE id=1', [logo]); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Seitenlogo aktualisiert.', pageMenu);
      }
      if (s.step === 'title') { await db.query('UPDATE settings SET title=$1,version=version+1 WHERE id=1', [t.slice(0, 120)]); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Seitentitel gespeichert.', textMenu); }
      if (s.step === 'description') { await db.query('UPDATE settings SET description=$1,version=version+1 WHERE id=1', [t === '/remove' ? '' : t.slice(0, 500)]); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Beschreibung gespeichert.', textMenu); }
      if (s.step === 'ticker') { await db.query('UPDATE settings SET ticker=$1,ticker_enabled=$2,version=version+1 WHERE id=1', [t.toLowerCase() === 'aus' ? '' : t.slice(0, 500), t.toLowerCase() !== 'aus']); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Laufbanner aktualisiert.', textMenu); }
      if (s.step === 'sponsor_name') { s.name = t.slice(0, 120); s.step = 'sponsor_logo'; return bot.sendMessage(m.chat.id, 'Sponsorlogo als Foto oder /skip:'); }
      if (s.step === 'sponsor_logo') { s.logo = t === '/skip' ? null : await photo(bot, m); if (t !== '/skip' && !s.logo) return bot.sendMessage(m.chat.id, 'Bitte ein Foto senden oder /skip.'); s.step = 'sponsor_url'; return bot.sendMessage(m.chat.id, 'Optionale Website-URL oder /skip:'); }
      if (s.step === 'sponsor_url') { const url = t === '/skip' ? null : t.slice(0, 500); await db.query('INSERT INTO sponsors(name,logo,url) VALUES($1,$2,$3)', [s.name, s.logo, url]); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Sponsor hinzugefügt.', pageMenu); }
      if (s.step === 'team_name') { s.name = t.slice(0, 100); s.step = 'team_group'; return bot.sendMessage(m.chat.id, 'Gruppe oder „-“:'); }
      if (s.step === 'team_group') { s.group = t === '-' ? null : t.slice(0, 40); s.step = 'team_logo'; return bot.sendMessage(m.chat.id, 'Teamlogo oder /skip:'); }
      if (s.step === 'team_logo') { const logo = t === '/skip' ? null : await photo(bot, m); if (t !== '/skip' && !logo) return bot.sendMessage(m.chat.id, 'Bitte ein Foto senden oder /skip.'); await db.query('INSERT INTO teams(name,group_name,logo) VALUES($1,$2,$3)', [s.name, s.group, logo]); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Team angelegt.', mainMenu); }
      if (s.step === 'team_logo_edit') { const logo = t === '/remove' ? null : await photo(bot, m); if (t !== '/remove' && !logo) return bot.sendMessage(m.chat.id, 'Bitte ein Foto senden oder /remove.'); await db.query('UPDATE teams SET logo=$1,version=version+1 WHERE id=$2', [logo, s.teamId]); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Teamlogo aktualisiert.', mainMenu); }
      if (s.step === 'group_count') { const n = +t; if (!Number.isInteger(n) || n < 1 || n > 26) return bot.sendMessage(m.chat.id, '1 bis 26.'); await assignGroups(n); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Gruppen automatisch verteilt.', mainMenu); }
      if (s.step === 'manual_group') { await db.query('UPDATE teams SET group_name=$1,rank_override=NULL,version=version+1 WHERE id=$2', [t === '-' ? null : t.slice(0, 40), s.teamId]); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Gruppe geändert.', mainMenu); }
      if (s.step === 'tie_order') { const ids = t.split(',').map((x) => Number(x.trim())).filter(Number.isInteger); if (ids.length !== s.allowedIds.length || ids.some((x) => !s.allowedIds.includes(x)) || new Set(ids).size !== ids.length) return bot.sendMessage(m.chat.id, `Bitte genau diese IDs einmal angeben: ${s.allowedIds.join(', ')}`); await setTieOrder(s.group, ids); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Reihenfolge gespeichert.', mainMenu); }
    } catch (e) { await done(m.from.id); console.error(e); return bot.sendMessage(m.chat.id, 'Aktion fehlgeschlagen.', mainMenu); }
  });
}

async function showSponsors(bot, chat) {
  const { rows } = await db.query('SELECT id,name FROM sponsors ORDER BY sort_order,id');
  const rowsKb = rows.map((s) => [{ text: `🤝 ${s.name}`, callback_data: `sponsor:${s.id}` }]);
  rowsKb.push([{ text: '➕ Sponsor hinzufügen', callback_data: 'sponsor_add' }], [{ text: '⬅️ Seite verwalten', callback_data: 'page' }]);
  return bot.sendMessage(chat, rows.length ? 'Sponsoren verwalten:' : 'Noch keine Sponsoren. Sponsoren sind optional.', kb(rowsKb));
}
async function chooseTeam(bot, chat, title, prefix) {
  const { rows } = await db.query('SELECT id,name FROM teams WHERE NOT is_demo ORDER BY name');
  return bot.sendMessage(chat, title, kb(rows.map((t) => [{ text: t.name, callback_data: prefix + t.id }])));
}
async function teamManage(bot, chat, teamId) {
  const t = (await db.query('SELECT * FROM teams WHERE id=$1 AND NOT is_demo', [teamId])).rows[0];
  if (!t) return showTeams(bot, chat);
  return bot.sendMessage(chat, `${t.disqualified ? '⛔ ' : ''}${t.name}\nGruppe: ${t.group_name || '–'}`, kb([
    [{ text: t.disqualified ? '✅ Disqualifikation aufheben' : '⛔ Disqualifizieren', callback_data: `team_dq:${t.id}` }],
    [{ text: '✏️ Gruppe ändern', callback_data: `team_group:${t.id}` }, { text: '🖼 Logo ändern', callback_data: `team_logo:${t.id}` }],
    [{ text: '⬅️ Teams', callback_data: 'teams' }],
  ]));
}
async function showTeams(bot, chat) {
  const { rows } = await db.query('SELECT * FROM teams ORDER BY is_demo,group_name NULLS LAST,name');
  const summary = rows.length ? rows.map((t) => `${t.is_demo ? '🧪 ' : ''}${t.disqualified ? '⛔ ' : ''}${t.name}${t.group_name ? ` · ${t.group_name}` : ''}`).join('\n') : 'Noch keine Teams.';
  return bot.sendMessage(chat, `Teams:\n${summary}`, kb([
    [{ text: '➕ Team hinzufügen', callback_data: 'team_add' }, { text: '🛠 Team verwalten', callback_data: 'team_manage' }],
    [{ text: '🎲 Automatisch gruppieren', callback_data: 'groups_auto' }, { text: '✏️ Gruppe zuweisen', callback_data: 'groups_manual' }],
    [{ text: '🧩 Gruppenspiele erzeugen', callback_data: 'groups_games' }],
    [{ text: '⬅️ Hauptmenü', callback_data: 'main' }],
  ]));
}
async function showGames(bot, chat) {
  const { rows } = await db.query(`SELECT g.id,g.status,g.winner_team_id,g.is_demo,h.name home,a.name away,w.name winner FROM games g JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id LEFT JOIN teams w ON w.id=g.winner_team_id ORDER BY g.is_demo,g.round_no NULLS FIRST,g.slot_no NULLS FIRST,g.id LIMIT 100`);
  const rowsKb = rows.map((g) => [{ text: `${g.is_demo ? '🧪 ' : ''}${g.home} vs ${g.away}${g.winner ? ` · 🏆 ${g.winner}` : ''}`, callback_data: `res:${g.id}` }]);
  rowsKb.push([{ text: '⬅️ Hauptmenü', callback_data: 'main' }]);
  return bot.sendMessage(chat, rows.length ? 'Spiele:' : 'Noch keine Spiele. Erzeuge zuerst Gruppenspiele unter Teams & Gruppen.', kb(rowsKb));
}
