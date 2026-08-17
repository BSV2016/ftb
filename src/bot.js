import TelegramBot from 'node-telegram-bot-api';
import { db, audit, acquireLock, releaseLock } from './db.js';
import { validatePalette } from './colors.js';
import {
  assignGroups,
  createGroupGames,
  seedDemo,
  clearDemo,
  qualificationPlan,
  createKnockout,
  advanceKnockout,
  setTieOrder,
} from './tournament.js';

const admins = new Set((process.env.TELEGRAM_ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean));
const states = new Map();
const menu = { reply_markup: { inline_keyboard: [
  [{ text: '⚙️ Onboarding / Branding', callback_data: 'branding' }],
  [{ text: '👥 Teams & Gruppen', callback_data: 'teams' }, { text: '🏆 Spiele', callback_data: 'games' }],
  [{ text: '🌳 K.-o.-Phase', callback_data: 'ko' }],
  [{ text: '📜 Regelwerk', callback_data: 'rules' }, { text: '📢 Laufbanner', callback_data: 'ticker' }],
  [{ text: '🧪 Testdaten', callback_data: 'demo' }],
] } };

async function begin(bot, chat, id, scope, state, text) {
  const l = await acquireLock(scope, id);
  if (!l.ok) return bot.sendMessage(chat, '⚠️ Ein anderer Administrator bearbeitet diesen Bereich gerade.');
  states.set(id, { ...state, scope });
  return bot.sendMessage(chat, text);
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

export function startBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
  const ok = (m, u = m.from) => m.chat?.type === 'private' && admins.has(String(u?.id));

  bot.onText(/\/start/, (m) => ok(m)
    ? bot.sendMessage(m.chat.id, 'FTB Administration', menu)
    : bot.sendMessage(m.chat.id, 'Kein Zugriff.'));

  bot.on('callback_query', async (q) => {
    const m = q.message;
    const id = q.from.id;
    const d = q.data;
    if (!ok(m, q.from)) return;
    await bot.answerCallbackQuery(q.id);

    try {
      if (d === 'branding') return begin(bot, m.chat.id, id, 'branding', { step: 'title' }, 'Seitentitel:');
      if (d === 'rules') return begin(bot, m.chat.id, id, 'rules', { step: 'rules' }, 'Regelwerk senden:');
      if (d === 'ticker') return begin(bot, m.chat.id, id, 'ticker', { step: 'ticker' }, 'Bannertext senden, „aus“ deaktiviert:');
      if (d === 'teams') return showTeams(bot, m.chat.id);
      if (d === 'games') return showGames(bot, m.chat.id);
      if (d === 'team_add') return begin(bot, m.chat.id, id, 'teams', { step: 'team_name' }, 'Teamname:');
      if (d === 'groups_auto') return begin(bot, m.chat.id, id, 'teams', { step: 'group_count' }, 'Anzahl Gruppen, 1 bis 26:');
      if (d === 'groups_manual') return chooseTeam(bot, m.chat.id, 'Team wählen:', 'gm:');
      if (d.startsWith('gm:')) return begin(bot, m.chat.id, id, 'teams', { step: 'manual_group', teamId: +d.split(':')[1] }, 'Neue Gruppe, „-“ für keine:');

      if (d === 'groups_games') {
        const l = await acquireLock('games', id);
        if (!l.ok) return bot.sendMessage(m.chat.id, '⚠️ Spiele werden gerade bearbeitet.');
        try {
          const r = await createGroupGames();
          await audit(id, 'group_games.create', r);
          return bot.sendMessage(m.chat.id, `${r.games} Gruppenspiele in ${r.groups} Gruppen erstellt.`, menu);
        } catch (e) {
          if (e.message === 'group_games_exist') return bot.sendMessage(m.chat.id, 'Es existieren bereits Gruppenspiele. Bestehende Ergebnisse werden nicht überschrieben.', menu);
          throw e;
        } finally {
          await releaseLock('games', id);
        }
      }

      if (d.startsWith('dq:')) {
        const l = await acquireLock('teams', id);
        if (!l.ok) return bot.sendMessage(m.chat.id, '⚠️ Teams werden gerade bearbeitet.');
        await db.query('UPDATE teams SET disqualified=NOT disqualified,version=version+1 WHERE id=$1', [+d.split(':')[1]]);
        await releaseLock('teams', id);
        return showTeams(bot, m.chat.id);
      }

      if (d === 'demo') return bot.sendMessage(m.chat.id, 'Testdaten:', { reply_markup: { inline_keyboard: [[{ text: 'Erstellen', callback_data: 'demo_seed' }, { text: 'Löschen', callback_data: 'demo_clear' }]] } });
      if (d === 'demo_seed') { await seedDemo(); return bot.sendMessage(m.chat.id, 'Testdaten erstellt.', menu); }
      if (d === 'demo_clear') { await clearDemo(); return bot.sendMessage(m.chat.id, 'Testdaten gelöscht. Einstellungen bleiben erhalten.', menu); }

      if (d === 'ko') {
        const p = await qualificationPlan();
        if (!p.size) return bot.sendMessage(m.chat.id, 'Noch nicht genug Teams für eine K.-o.-Phase.');
        if (p.unresolved.length) {
          return bot.sendMessage(m.chat.id, '⚖️ Vor der K.-o.-Phase müssen Gleichstände durch einen Administrator entschieden werden.', {
            reply_markup: { inline_keyboard: p.unresolved.map((x) => [{
              text: `Gruppe ${x.group}: ${x.teams.map((t) => t.name).join(' / ')}`,
              callback_data: `tie:${x.group}`,
            }]) },
          });
        }
        return bot.sendMessage(
          m.chat.id,
          `Empfehlung: ${p.size}er K.-o.-Runde bei ${p.tables.reduce((n, g) => n + g.teams.length, 0)} Teams.\nQualifiziert: ${p.qualified.map((x) => x.name).join(', ')}\n\nWie soll das Finale gespielt werden?`,
          { reply_markup: { inline_keyboard: [[{ text: '1 Entscheidungsspiel', callback_data: 'ko_single' }], [{ text: 'Best of Three', callback_data: 'ko_bo3' }]] } },
        );
      }

      if (d.startsWith('tie:')) {
        const group = d.slice(4);
        const p = await qualificationPlan();
        const tie = p.unresolved.find((x) => x.group === group);
        if (!tie) return bot.sendMessage(m.chat.id, 'Für diese Gruppe gibt es keinen offenen Gleichstand mehr.', menu);
        const lines = tie.teams.map((t) => `${t.id}: ${t.name}`).join('\n');
        return begin(
          bot,
          m.chat.id,
          id,
          'knockout',
          { step: 'tie_order', group, allowedIds: tie.teams.map((t) => t.id) },
          `Reihenfolge für Gruppe ${group} festlegen.\nSende die Team-IDs von Platz oben nach unten, mit Komma getrennt:\n\n${lines}`,
        );
      }

      if (d === 'ko_single' || d === 'ko_bo3') {
        const mode = d === 'ko_bo3' ? 'bo3' : 'single';
        const l = await acquireLock('knockout', id);
        if (!l.ok) return bot.sendMessage(m.chat.id, '⚠️ K.-o.-Phase wird gerade bearbeitet.');
        try {
          const p = await createKnockout(mode);
          await audit(id, 'knockout.create', { size: p.size, finalMode: mode });
          return bot.sendMessage(m.chat.id, `${p.size}er K.-o.-Phase erstellt. Finale: ${mode === 'bo3' ? 'Best of Three' : 'ein Spiel'}. Die nächsten Runden werden nach vollständigem Abschluss einer Runde automatisch erzeugt.`, menu);
        } finally {
          await releaseLock('knockout', id);
        }
      }

      if (d.startsWith('res:')) {
        const gameId = +d.split(':')[1];
        const g = (await db.query(
          `SELECT g.version,h.id hid,h.name home,a.id aid,a.name away FROM games g JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id WHERE g.id=$1`,
          [gameId],
        )).rows[0];
        if (!g) return;
        const l = await acquireLock(`game:${gameId}`, id);
        if (!l.ok) return bot.sendMessage(m.chat.id, '⚠️ Dieses Spiel wird gerade bearbeitet.');
        states.set(id, { scope: `game:${gameId}`, step: 'winner', gameId, version: g.version });
        return bot.sendMessage(m.chat.id, 'Sieger wählen:', { reply_markup: { inline_keyboard: [
          [{ text: `🏆 ${g.home}`, callback_data: `win:${gameId}:${g.hid}:${g.version}` }],
          [{ text: `🏆 ${g.away}`, callback_data: `win:${gameId}:${g.aid}:${g.version}` }],
          [{ text: 'Spiel läuft', callback_data: `live:${gameId}:${g.version}` }, { text: 'Absagen', callback_data: `cancel:${gameId}:${g.version}` }],
        ] } });
      }

      if (d.startsWith('win:') || d.startsWith('live:') || d.startsWith('cancel:')) {
        const x = d.split(':');
        const gameId = +x[1];
        const isWin = d.startsWith('win:');
        const version = +(isWin ? x[3] : x[2]);
        const winner = isWin ? +x[2] : null;
        let r;
        if (isWin) {
          r = await db.query(
            "UPDATE games SET winner_team_id=$1,status='finished',version=version+1 WHERE id=$2 AND version=$3 RETURNING id",
            [winner, gameId, version],
          );
        } else {
          r = await db.query(
            'UPDATE games SET status=$1,winner_team_id=NULL,version=version+1 WHERE id=$2 AND version=$3 RETURNING id',
            [d.startsWith('live:') ? 'live' : 'cancelled', gameId, version],
          );
        }
        await done(id);
        if (!r.rowCount) return bot.sendMessage(m.chat.id, '⚠️ Spiel wurde zwischenzeitlich geändert. Bitte neu öffnen.', menu);
        if (isWin) {
          const progress = await advanceKnockout(gameId);
          if (progress.finished) await audit(id, 'tournament.finish', { winnerTeamId: progress.winnerTeamId });
        }
        return bot.sendMessage(m.chat.id, 'Spiel aktualisiert.', menu);
      }
    } catch (e) {
      await done(id);
      console.error(e);
      return bot.sendMessage(m.chat.id, 'Aktion fehlgeschlagen.', menu);
    }
  });

  bot.on('message', async (m) => {
    if (m.text?.startsWith('/start') || !ok(m)) return;
    const s = states.get(m.from.id);
    if (!s) return;
    const t = (m.text || '').trim();
    try {
      if (s.step === 'title') { s.title = t.slice(0, 100); s.step = 'sport'; return bot.sendMessage(m.chat.id, 'Sportart, leer = Flunkyball:'); }
      if (s.step === 'sport') { s.sport = t || 'Flunkyball'; s.step = 'colors'; return bot.sendMessage(m.chat.id, 'Bis zu 3 HEX-Farben:'); }
      if (s.step === 'colors') {
        const c = t.split(/\s+/);
        while (c.length < 3) c.push(c.length === 1 ? '#FFFFFF' : '#F4B942');
        const v = validatePalette(...c.slice(0, 3));
        if (!v.ok) return bot.sendMessage(m.chat.id, v.error);
        s.colors = v.colors;
        s.step = 'logo';
        return bot.sendMessage(m.chat.id, 'Logo als Foto oder /skip:');
      }
      if (s.step === 'logo') {
        const logo = t === '/skip' ? null : await photo(bot, m);
        await db.query('UPDATE settings SET title=$1,sport_name=$2,primary_color=$3,secondary_color=$4,accent_color=$5,logo=COALESCE($6,logo),version=version+1 WHERE id=1', [s.title, s.sport, ...s.colors, logo]);
        await done(m.from.id);
        return bot.sendMessage(m.chat.id, 'Gespeichert.', menu);
      }
      if (s.step === 'rules') { await db.query('UPDATE settings SET rules=$1,version=version+1 WHERE id=1', [t.slice(0, 20000)]); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Regelwerk gespeichert.', menu); }
      if (s.step === 'ticker') { await db.query('UPDATE settings SET ticker=$1,ticker_enabled=$2,version=version+1 WHERE id=1', [t.toLowerCase() === 'aus' ? '' : t.slice(0, 500), t.toLowerCase() !== 'aus']); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Banner aktualisiert.', menu); }
      if (s.step === 'team_name') { s.name = t.slice(0, 100); s.step = 'team_group'; return bot.sendMessage(m.chat.id, 'Gruppe oder „-“:'); }
      if (s.step === 'team_group') { s.group = t === '-' ? null : t.slice(0, 40); s.step = 'team_logo'; return bot.sendMessage(m.chat.id, 'Teamlogo oder /skip:'); }
      if (s.step === 'team_logo') { const logo = t === '/skip' ? null : await photo(bot, m); await db.query('INSERT INTO teams(name,group_name,logo) VALUES($1,$2,$3)', [s.name, s.group, logo]); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Team angelegt.', menu); }
      if (s.step === 'group_count') {
        const n = +t;
        if (!Number.isInteger(n) || n < 1 || n > 26) return bot.sendMessage(m.chat.id, '1 bis 26.');
        await assignGroups(n);
        await done(m.from.id);
        return bot.sendMessage(m.chat.id, 'Gruppen automatisch verteilt. Erzeuge jetzt unter „Teams & Gruppen“ die Gruppenspiele.', menu);
      }
      if (s.step === 'manual_group') { await db.query('UPDATE teams SET group_name=$1,rank_override=NULL,version=version+1 WHERE id=$2', [t === '-' ? null : t.slice(0, 40), s.teamId]); await done(m.from.id); return bot.sendMessage(m.chat.id, 'Gruppe geändert.', menu); }
      if (s.step === 'tie_order') {
        const ids = t.split(',').map((x) => Number(x.trim())).filter(Number.isInteger);
        if (ids.length !== s.allowedIds.length || ids.some((x) => !s.allowedIds.includes(x)) || new Set(ids).size !== ids.length) {
          return bot.sendMessage(m.chat.id, `Bitte genau diese IDs einmal angeben: ${s.allowedIds.join(', ')}`);
        }
        await setTieOrder(s.group, ids);
        await audit(m.from.id, 'tie.resolve', { group: s.group, orderedTeamIds: ids });
        await done(m.from.id);
        return bot.sendMessage(m.chat.id, 'Gleichstand entschieden. Die K.-o.-Qualifikation kann jetzt neu geöffnet werden.', menu);
      }
    } catch (e) {
      await done(m.from.id);
      console.error(e);
      return bot.sendMessage(m.chat.id, 'Aktion fehlgeschlagen.', menu);
    }
  });
}

async function chooseTeam(bot, chat, title, prefix) {
  const { rows } = await db.query('SELECT id,name FROM teams WHERE NOT is_demo ORDER BY name');
  return bot.sendMessage(chat, title, { reply_markup: { inline_keyboard: rows.map((t) => [{ text: t.name, callback_data: prefix + t.id }]) } });
}

async function showTeams(bot, chat) {
  const { rows } = await db.query('SELECT * FROM teams ORDER BY is_demo,group_name NULLS LAST,name');
  const k = rows.map((t) => [{ text: `${t.is_demo ? '🧪 ' : ''}${t.disqualified ? '⛔ ' : ''}${t.name}${t.group_name ? ' · ' + t.group_name : ''}`, callback_data: `dq:${t.id}` }]);
  k.push(
    [{ text: '➕ Team', callback_data: 'team_add' }],
    [{ text: '🎲 Automatisch gruppieren', callback_data: 'groups_auto' }, { text: '✏️ Gruppe ändern', callback_data: 'groups_manual' }],
    [{ text: '🗓️ Gruppenspiele erzeugen', callback_data: 'groups_games' }],
  );
  return bot.sendMessage(chat, 'Teams:', { reply_markup: { inline_keyboard: k } });
}

async function showGames(bot, chat) {
  const { rows } = await db.query(`SELECT g.id,g.status,g.winner_team_id,g.is_demo,g.phase,g.round_label,h.name home,a.name away,w.name winner FROM games g JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id LEFT JOIN teams w ON w.id=g.winner_team_id ORDER BY g.is_demo,g.phase,g.round_no NULLS FIRST,g.slot_no NULLS FIRST,g.id LIMIT 100`);
  const k = rows.map((g) => [{
    text: `${g.is_demo ? '🧪 ' : ''}${g.round_label ? g.round_label + ' · ' : ''}${g.home} vs ${g.away}${g.winner ? ' · 🏆 ' + g.winner : ''}`,
    callback_data: `res:${g.id}`,
  }]);
  return bot.sendMessage(chat, 'Spiele:', { reply_markup: { inline_keyboard: k } });
}
