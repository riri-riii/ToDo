import { getAuthUsername, fetchTasks, createTask, updateTask, deleteTask, formatDate } from './src/task_api.js';

const username = getAuthUsername();
if (!username) {
  throw new Error('未ログイン');
}

const params = new URLSearchParams(window.location.search);
const editId = params.get('id');

function value(id) {
  return document.getElementById(id).value;
}

function setValue(id, v) {
  document.getElementById(id).value = v ?? '';
}

function collect() {
  return {
    name: value('name').trim(),
    plannedStart: value('plannedStart'),
    plannedEnd: value('plannedEnd'),
    progress: Number(value('progress')),
    actualStart: value('actualStart'),
    actualEnd: value('actualEnd'),
    plannedHours: value('plannedHours'),
    actualHours: value('actualHours')
  };
}

function validate(task) {
  if (!task.name || !task.plannedStart || !task.plannedEnd) {
    alert('必須項目を入力してください。');
    return false;
  }
  if (new Date(task.plannedEnd) < new Date(task.plannedStart)) {
    alert('予定終了日は予定開始日以降にしてください。');
    return false;
  }
  if (task.actualStart && task.actualEnd && new Date(task.actualEnd) < new Date(task.actualStart)) {
    alert('実終了日は実開始日以降にしてください。');
    return false;
  }
  return true;
}

async function loadEditData() {
  if (!editId) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    setValue('plannedStart', formatDate(today));
    setValue('plannedEnd', formatDate(tomorrow));
    setValue('progress', '0');
    return;
  }

  const tasks = await fetchTasks(username);
  const task = tasks.find((t) => t.orig_id === editId);
  if (!task) {
    alert('対象タスクが見つかりませんでした。');
    window.location.href = 'task_list.html';
    return;
  }

  document.getElementById('formTitle').textContent = 'タスク編集';
  document.getElementById('saveBtn').textContent = '更新';
  document.getElementById('deleteBtn').style.display = 'inline-block';

  setValue('name', task.name);
  setValue('plannedStart', task.plannedStart);
  setValue('plannedEnd', task.plannedEnd);
  setValue('progress', String(task.progress));
  setValue('actualStart', task.actualStart);
  setValue('actualEnd', task.actualEnd);
  setValue('plannedHours', task.plannedHours);
  setValue('actualHours', task.actualHours);
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('toGantt').addEventListener('click', () => {
    window.location.href = 'main.html';
  });
  document.getElementById('toList').addEventListener('click', () => {
    window.location.href = 'task_list.html';
  });

  await loadEditData();

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const task = collect();
    if (!validate(task)) return;

    if (editId) {
      await updateTask(username, editId, task);
    } else {
      await createTask(username, task);
    }
    window.location.href = 'task_list.html';
  });

  document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (!editId) return;
    if (!confirm('このタスクを削除しますか？')) return;
    await deleteTask(username, editId);
    window.location.href = 'task_list.html';
  });
});
