export const API_BASE = 'https://ws9tfsfzbd.execute-api.ap-northeast-1.amazonaws.com';

export function getAuthUsername() {
  const username = localStorage.getItem('authUser') || sessionStorage.getItem('authUser');
  if (!username) {
    window.location.href = 'index.html';
    return null;
  }
  return username;
}

export function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function toCssToken(s) {
  if (typeof s !== 'string') s = String(s ?? '');
  let token = s.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!/^[a-zA-Z_]/.test(token)) token = `t_${token}`;
  return token;
}

export function normalizeTask(raw) {
  return {
    id: toCssToken(raw.ID),
    orig_id: raw.ID,
    name: raw.name || '',
    start: raw.start || '',
    end: raw.end || '',
    progress: Number(raw.progress ?? 0),
    plannedStart: raw.plannedStart || raw.start || '',
    plannedEnd: raw.plannedEnd || raw.end || '',
    actualStart: raw.actualStart || '',
    actualEnd: raw.actualEnd || '',
    plannedHours: raw.plannedHours ?? '',
    actualHours: raw.actualHours ?? ''
  };
}

export async function fetchTasks(username) {
  const res = await fetch(`${API_BASE}/tasks?username=${encodeURIComponent(username)}`);
  const raw = await res.json();
  return raw.map(normalizeTask);
}

export async function createTask(username, task) {
  const now = new Date();
  const id = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}_${username}`;

  const payload = {
    ID: id,
    user: username,
    name: task.name,
    start: task.plannedStart,
    end: task.plannedEnd,
    progress: task.progress,
    plannedStart: task.plannedStart,
    plannedEnd: task.plannedEnd,
    actualStart: task.actualStart || null,
    actualEnd: task.actualEnd || null,
    plannedHours: task.plannedHours === '' ? null : Number(task.plannedHours),
    actualHours: task.actualHours === '' ? null : Number(task.actualHours)
  };

  await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function updateTask(username, taskId, task) {
  const payload = {
    ID: taskId,
    user: username,
    name: task.name,
    start: task.plannedStart,
    end: task.plannedEnd,
    progress: task.progress,
    plannedStart: task.plannedStart,
    plannedEnd: task.plannedEnd,
    actualStart: task.actualStart || null,
    actualEnd: task.actualEnd || null,
    plannedHours: task.plannedHours === '' ? null : Number(task.plannedHours),
    actualHours: task.actualHours === '' ? null : Number(task.actualHours)
  };

  await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteTask(username, taskId) {
  await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: username })
  });
}
