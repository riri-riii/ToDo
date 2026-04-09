import Gantt from './src/index.js';
import { API_BASE, getAuthUsername, fetchTasks, updateTask, getTaskActionState, applyTaskAction } from './src/task_api.js';

const username = getAuthUsername();
if (!username) {
  throw new Error('ユーザー未ログイン');
}

let ganttInstance = null;
let taskList = [];

function toCssToken(s) {
  if (typeof s !== 'string') s = String(s ?? '');
  let token = s.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!/^[a-zA-Z_]/.test(token)) token = `t_${token}`;
  return token;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function getIcsSources() {
  try {
    const url = `${API_BASE}/tasks_icsimport?user=${encodeURIComponent(username)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((it) => it.ics_url).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeIcsUrl(url) {
  if (!url) return '';
  return url.replace(/^webcal:\/\//i, 'https://');
}

function parseIcsDate(value, isAllDay) {
  if (!value) return null;
  if (isAllDay || /^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  const v = value.endsWith('Z') ? value : `${value}`;
  const dt = new Date(v.replace(/^(\d{4})(\d{2})(\d{2})T/, '$1-$2-$3T'));
  return Number.isNaN(dt.getTime()) ? null : formatDate(dt);
}

function unfoldIcsLines(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseICS(text) {
  const lines = unfoldIcsLines(text);
  const events = [];
  let cur = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') {
      cur = { summary: '', dtstart: null, dtend: null };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur && cur.dtstart) {
        const startStr = parseIcsDate(cur.dtstart.value, cur.dtstart.allDay);
        let endStr = parseIcsDate((cur.dtend && cur.dtend.value) || cur.dtstart.value, cur.dtend ? cur.dtend.allDay : cur.dtstart.allDay);
        if ((cur.dtend && cur.dtend.allDay) || cur.dtstart.allDay) {
          const sd = new Date(startStr);
          const ed = new Date(endStr);
          if (!Number.isNaN(ed.getTime()) && ed.getTime() > sd.getTime()) {
            ed.setDate(ed.getDate() - 1);
            endStr = formatDate(ed);
          }
        }
        events.push({ summary: cur.summary || 'ICSイベント', start: startStr, end: endStr });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('SUMMARY')) {
      const idx = line.indexOf(':');
      cur.summary = idx >= 0 ? line.slice(idx + 1) : line;
    }
    if (line.startsWith('DTSTART')) {
      const idx = line.indexOf(':');
      const prop = line.slice(0, idx);
      const val = idx >= 0 ? line.slice(idx + 1) : '';
      cur.dtstart = { value: val, allDay: /VALUE=DATE/.test(prop) };
    }
    if (line.startsWith('DTEND')) {
      const idx = line.indexOf(':');
      const prop = line.slice(0, idx);
      const val = idx >= 0 ? line.slice(idx + 1) : '';
      cur.dtend = { value: val, allDay: /VALUE=DATE/.test(prop) };
    }
  }
  return events;
}

function makeIcsTaskId(url, startStr, endStr, summary) {
  const base = `${url}__${startStr}__${endStr}__${summary}`;
  let enc = '';
  try { enc = b64utf8(base); } catch { enc = base; }
  const compact = enc.replace(/[+/=]/g, '');
  return toCssToken(`ics_${compact}`);
}

async function loadIcsTasks(from, to) {
  const sources = await getIcsSources();
  const all = [];
  for (const src of sources) {
    const normalized = normalizeIcsUrl(src);
    try {
      const b64url = btoa(unescape(encodeURIComponent(normalized)));
      const res = await fetch(`${API_BASE}/tasks_icsget?u=${b64url}`, { method: 'GET' });
      if (!res.ok) continue;
      const text = await res.text();
      const events = parseICS(text);
      for (const ev of events) {
        const endDate = new Date(ev.end);
        if (endDate >= from && endDate <= to) {
          all.push({
            id: makeIcsTaskId(normalized, ev.start, ev.end, ev.summary),
            name: ev.summary,
            start: ev.start,
            end: ev.end,
            progress: 0,
            isIcs: true,
            custom_class: 'ics-task'
          });
        }
      }
    } catch {
      // noop
    }
  }
  return all;
}

async function loadGantt() {
  const today = new Date();
  const past = new Date(today);
  past.setDate(today.getDate() - 14);
  const future = new Date(today);
  future.setDate(today.getDate() + 180);

  const rawTasks = await fetchTasks(username);
  const awsTasks = rawTasks
    .filter((t) => new Date(t.end) >= past && new Date(t.end) <= future)
    .map((t) => ({
      id: t.id,
      orig_id: t.orig_id,
      name: t.name,
      start: t.plannedStart,
      end: t.plannedEnd,
      progress: Number(t.progress || 0),
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      actualStart: t.actualStart,
      actualEnd: t.actualEnd,
      plannedHours: t.plannedHours,
      actualHours: t.actualHours
    }));

  const icsTasks = await loadIcsTasks(past, future);
  taskList = [...awsTasks, ...icsTasks].sort((a, b) => new Date(a.start) - new Date(b.start));

  if (ganttInstance) {
    ganttInstance.refresh(taskList);
    return;
  }

  ganttInstance = new Gantt('#gantt', taskList, {
    view_mode: 'Day',
    container_height: window.innerHeight - 58,
    grid_height: 30,
    today_button: true,
    auto_move_label: false,
    infinite_padding: true,
    popup: ({ task, set_title, set_subtitle, set_details, add_action }) => {
      set_title(task.isIcs ? `${task.name}（取り込み）` : task.name);
      set_subtitle(`${task.start} ～ ${task.end}`);
      set_details(`進捗: ${task.progress}%`);
      if (task.isIcs) return;

      add_action('編集', () => {
        const id = encodeURIComponent(task.orig_id || task.id);
        window.location.href = `task_form.html?id=${id}`;
      });

      const { action, label } = getTaskActionState(task);
      add_action(label, async () => {
        const updated = applyTaskAction(task, action);
        await updateTask(username, task.orig_id || task.id, updated);
        await loadGantt();
      });
    }
  });

  window.addEventListener('resize', () => {
    ganttInstance.update_options({ container_height: window.innerHeight - 58 });
  });
}

function setupMenu() {
  const menuBtn = document.getElementById('menuBtn');
  const menu = document.getElementById('menuDropdown');
  const menuLogout = document.getElementById('menuLogout');
  const menuIcs = document.getElementById('menuIcs');

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', () => menu.classList.remove('open'));

  menuLogout.addEventListener('click', () => {
    localStorage.removeItem('authUser');
    sessionStorage.removeItem('authUser');
    window.location.href = 'index.html';
  });

  menuIcs.addEventListener('click', () => {
    window.location.href = 'ics_setting.html';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('toList').addEventListener('click', () => {
    window.location.href = 'task_list.html';
  });
  document.getElementById('toCreate').addEventListener('click', () => {
    window.location.href = 'task_form.html';
  });
  setupMenu();
  await loadGantt();
});
