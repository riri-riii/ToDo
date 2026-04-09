import { getAuthUsername, fetchTasks, updateTask, getTaskActionState, applyTaskAction } from './src/task_api.js';

const username = getAuthUsername();
if (!username) {
  throw new Error('未ログイン');
}

function h(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function render() {
  const rows = document.getElementById('taskRows');
  const tasks = await fetchTasks(username);
  const sorted = tasks.sort((a, b) => new Date(a.plannedStart) - new Date(b.plannedStart));

  rows.innerHTML = sorted.map((t) => {
    const id = encodeURIComponent(t.orig_id);
    const state = getTaskActionState(t);
    return `
      <tr data-id="${h(t.orig_id)}" class="row-link">
        <td>${h(t.name)}</td>
        <td>${h(t.plannedStart)}</td>
        <td>${h(t.plannedEnd)}</td>
        <td>${h(t.progress)}%</td>
        <td>${h(t.actualStart)}</td>
        <td>${h(t.actualEnd)}</td>
        <td>${h(t.plannedHours)}</td>
        <td>${h(t.actualHours)}</td>
        <td>
          <button class="edit-btn" data-id="${id}">編集</button>
          <button class="state-btn" data-id="${id}" data-action="${state.action}">${state.label}</button>
        </td>
      </tr>`;
  }).join('');

  rows.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `task_form.html?id=${btn.dataset.id}`;
    });
  });

  rows.querySelectorAll('.state-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = decodeURIComponent(btn.dataset.id);
      const action = btn.dataset.action;
      const target = tasks.find((t) => t.orig_id === taskId);
      if (!target) return;
      const updated = applyTaskAction(target, action);
      await updateTask(username, taskId, updated);
      await render();
    });
  });

  rows.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      window.location.href = `task_form.html?id=${encodeURIComponent(tr.dataset.id)}`;
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('toGantt').addEventListener('click', () => {
    window.location.href = 'main.html';
  });
  document.getElementById('toCreate').addEventListener('click', () => {
    window.location.href = 'task_form.html';
  });
  await render();
});
