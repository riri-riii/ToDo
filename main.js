import Gantt from './src/index.js';

const API_BASE = 'https://ws9tfsfzbd.execute-api.ap-northeast-1.amazonaws.com';
const username = localStorage.getItem("authUser") || sessionStorage.getItem("authUser");
if (!username) window.location.href = "index.html";

/* ユーザーごとの ICS 設定キー */
const ICS_KEY = `icsCalendars:${username}`;

/* ICS プロキシ（API Gateway + Lambda の /ics-proxy を想定） */
const ICS_PROXY_BASE = `${API_BASE}/ics-proxy`;

const GanttApp = (() => {
    let awsTasks = [];       /* AWS由来（編集可） */
    let taskList = [];       /* 表示用（AWS + ICSのマージ） */
    let ganttInstance = null;
    let selectedTaskId = null;

    async function loadTasks(scrollToToday = false) {
        const res = await fetch(`${API_BASE}/tasks?username=${encodeURIComponent(username)}`);
        const raw = await res.json();

        awsTasks = raw.map(t => ({
            id: t.ID,
            name: t.name,
            start: t.start,
            end: t.end,
            progress: t.progress
        }));

        await render({ scrollToToday });
        await afterFirstVisibleScroll();
    }

    async function afterFirstVisibleScroll(){
        const today = new Date();
        const todayStr = formatDate(today);
        const firstVisibleTask = taskList
            .filter(t => t.end >= todayStr)
            .sort((a, b) => new Date(a.start) - new Date(b.start))[0];

        if (firstVisibleTask && ganttInstance) {
            setTimeout(() => {
                const index = taskList.findIndex(t => t.id === firstVisibleTask.id);
                const rows = document.querySelectorAll('.grid-row');
                const container = document.getElementById("gantt-container");
                const row = rows[index];

                if (row && container) {
                    const containerTop = container.getBoundingClientRect().top;
                    const rowTop = row.getBoundingClientRect().top;
                    const scrollOffset = rowTop - containerTop;
                    container.scrollTop += scrollOffset - 10;
                }
            }, 100);
        }
    }

    async function render({ scrollToToday = false } = {}) {
        const today = new Date();
        const past = new Date(today); past.setDate(today.getDate() - 14);
        const future = new Date(today); future.setDate(today.getDate() + 180);

        const icsTasks = await loadIcsTasks(past, future);

        const awsInRange = awsTasks.filter(t => {
            const endDate = new Date(t.end);
            return endDate >= past && endDate <= future;
        });

        taskList = [...awsInRange, ...icsTasks]
            .sort((a, b) => new Date(a.start) - new Date(b.start));

        if (ganttInstance) {
            ganttInstance.refresh(taskList);
            if (scrollToToday) ganttInstance.scroll_current();
        } else {
            ganttInstance = new Gantt("#gantt", taskList, {
                view_mode: 'Day',
                container_height: window.innerHeight - 65,
                grid_height: 30,
                today_button: true,
                auto_move_label: false,
                infinite_padding: true,
                on_click: (task) => {
                    if (task.isIcs) {
                        clearSelection();
                        alert("このイベントは取り込み専用のため編集できません。");
                        return;
                    }
                    selectedTaskId = task.id;
                    document.getElementById("taskName").value = task.name;
                    document.getElementById("startDate").value = task.start;
                    document.getElementById("endDate").value = task.end;
                    document.getElementById("addOrUpdateBtn").textContent = "タスクを更新";
                    document.getElementById("deleteBtn").style.display = "inline-block";
                    document.getElementById("cancelBtn").style.display = "inline-block";
                },
                on_date_change: async (task, start, end) => {
                    if (task.isIcs) {
                        alert("このイベントは取り込み専用のため移動・期間変更できません。");
                        ganttInstance.refresh(taskList);
                        return;
                    }
                    const jstStart = new Date(start.getTime() + 24 * 60 * 60 * 1000);
                    const jstEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);
                    task.start = formatDate(jstStart);
                    task.end = formatDate(jstEnd);
                    await GanttApp.updateTask(task);
                    ganttInstance.refresh(taskList);
                },
                popup: ({ task, set_title, set_subtitle, set_details, add_action }) => {
                    set_title(task.isIcs ? `${task.name}（取り込み）` : task.name);
                    set_subtitle(`${task.start} ～ ${task.end}`);
                    set_details(`進捗: ${task.progress}%`);
                    if (task.isIcs) return;
                    const isComplete = task.progress === 100;
                    add_action(isComplete ? "未完了にする" : "完了にする", async () => {
                        task.progress = isComplete ? 0 : 100;
                        await GanttApp.updateTask(task);
                        ganttInstance.refresh(taskList);
                    });
                }
            });

            window.addEventListener('resize', () => {
                ganttInstance.update_options({
                    container_height: window.innerHeight - 65
                });
            });

            ganttInstance.scroll_current();
        }
    }

    async function addOrUpdateTask() {
        const name = document.getElementById("taskName").value || "task";
        const start = document.getElementById("startDate").value;
        const end = document.getElementById("endDate").value;
        if (!start || !end) return alert("日付を入力してください。");

        if (selectedTaskId) {
            const task = taskList.find(t => t.id === selectedTaskId);
            if (task && task.isIcs) {
                alert("このイベントは取り込み専用のため編集できません。");
                clearSelection();
                return;
            }
            Object.assign(task, { name, start, end });
            await updateTask(task);
        } else {
            const utcNow = new Date();
            const jstNow = new Date(utcNow.getTime() + 9 * 60 * 60 * 1000);
            const yyyymmddhhmmss =
                jstNow.getFullYear().toString() +
                String(jstNow.getMonth() + 1).padStart(2, '0') +
                String(jstNow.getDate()).padStart(2, '0') +
                String(jstNow.getHours()).padStart(2, '0') +
                String(jstNow.getMinutes()).padStart(2, '0') +
                String(jstNow.getSeconds()).padStart(2, '0');
            const id = `${yyyymmddhhmmss}_${username}`;
            const newTask = {
                ID: id,
                name,
                start,
                end,
                progress: 0,
                user: username
            };
            await fetch(`${API_BASE}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTask)
            });
        }
        clearSelection();
        await loadTasks();
    }

    async function updateTask(task) {
        await fetch(`${API_BASE}/tasks/${task.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ID: task.id,
                name: task.name,
                start: task.start,
                end: task.end,
                progress: task.progress,
                user: username
            })
        });
    }

    async function deleteTask() {
        if (!selectedTaskId) return;
        const task = taskList.find(t => t.id === selectedTaskId);
        if (task && task.isIcs) {
            alert("このイベントは取り込み専用のため削除できません。");
            clearSelection();
            return;
        }
        await fetch(`${API_BASE}/tasks/${selectedTaskId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: username })
        });
        clearSelection();
        await loadTasks();
    }

    function clearSelection() {
        selectedTaskId = null;
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        document.getElementById("taskName").value = "";
        document.getElementById("startDate").value = formatDate(today);
        document.getElementById("endDate").value = formatDate(tomorrow);
        document.getElementById("addOrUpdateBtn").textContent = "タスクを追加";
        document.getElementById("deleteBtn").style.display = "none";
        document.getElementById("cancelBtn").style.display = "none";
    }

    /* --- ICS 関連（ical.js 使用版） --------------------------- */

    function getIcsSources() {
        try {
            const raw = localStorage.getItem(ICS_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    function normalizeIcsUrl(url) {
        if (!url) return "";
        return url.replace(/^webcal:\/\//i, 'https://');
    }

    function makeIcsTaskId(url, startStr, endStr, summary) {
        const base = `${url}__${startStr}__${endStr}__${summary}`;
        let enc = '';
        try { enc = btoa(base); } catch { enc = base; }
        return `ics_${enc.replace(/[+/=]/g, '')}`;
    }

    function toDateString(d){
        const y = d.getFullYear();
        const m = String(d.getMonth()+1).padStart(2,'0');
        const day = String(d.getDate()).padStart(2,'0');
        return `${y}-${m}-${day}`;
    }

    function clampRangeByDay(start, end, past, future){
        // 可視期間にざっくり合わせる（必要に応じて拡張可）
        return (end >= past && end <= future);
    }

    async function loadIcsTasks(past, future) {
        const sources = getIcsSources();
        const out = [];

        for (const src of sources) {
            const normalized = normalizeIcsUrl(src);
            const proxied = `${ICS_PROXY_BASE}?u=${encodeURIComponent(btoa(normalized))}`;
            try {
                const res = await fetch(proxied, { method: 'GET' });
                if (!res.ok) throw new Error(`proxy status ${res.status}`);
                const icsText = await res.text();

                // ical.js 解析
                const jCalData = ICAL.parse(icsText);
                const comp = new ICAL.Component(jCalData);
                const vevents = comp.getAllSubcomponents('vevent');

                for (const sub of vevents) {
                    const ev = new ICAL.Event(sub);

                    // 単発
                    if (!ev.isRecurring()) {
                        const start = ev.startDate.toJSDate();
                        const endJs = ev.endDate?.toJSDate();
                        if (!endJs) continue;

                        let end = new Date(endJs.getTime());
                        // 終日（exclusive DTEND のため -1日）
                        if (ev.startDate.isDate || ev.endDate?.isDate) {
                            end.setDate(end.getDate() - 1);
                        }

                        if (!clampRangeByDay(start, end, past, future)) continue;

                        const startStr = toDateString(start);
                        const endStr = toDateString(end);
                        out.push({
                            id: makeIcsTaskId(normalized, startStr, endStr, ev.summary || 'ICSイベント'),
                            name: ev.summary || 'ICSイベント',
                            start: startStr,
                            end: endStr,
                            progress: 0,
                            isIcs: true,
                            custom_class: 'ics-task'
                        });
                        continue;
                    }

                    // 繰り返し
                    const iter = new ICAL.RecurExpansion({ component: ev.component, dtstart: ev.startDate });
                    const duration = ev.duration; // 例: 終日なら P1D
                    let safety = 5000; // 無限ループ防止

                    while (safety-- > 0) {
                        const next = iter.next();
                        if (!next) break;

                        const occStart = next.toJSDate();
                        if (occStart > future) break;  // 未来側に出たら打ち切り
                        if (occStart < past) continue; // 過去側はスキップ

                        // 終了は開始 + 期間（duration が無いケースは endDate から計算）
                        let occEnd;
                        if (duration) {
                            const tmp = next.clone();
                            tmp.addDuration(duration);
                            occEnd = tmp.toJSDate();
                        } else if (ev.endDate) {
                            const baseDur = ev.endDate.toJSDate().getTime() - ev.startDate.toJSDate().getTime();
                            occEnd = new Date(occStart.getTime() + Math.max(baseDur, 0));
                        } else {
                            // 終了が無い異常ケースは 1 日にしておく
                            occEnd = new Date(occStart.getTime());
                            occEnd.setDate(occEnd.getDate() + 1);
                        }

                        // 終日（isDate）なら -1 日で表示上の最終日に合わせる
                        if (ev.startDate.isDate || ev.endDate?.isDate) {
                            occEnd.setDate(occEnd.getDate() - 1);
                        }

                        const startStr = toDateString(occStart);
                        const endStr = toDateString(occEnd);

                        out.push({
                            id: makeIcsTaskId(normalized, startStr, endStr, ev.summary || 'ICSイベント'),
                            name: ev.summary || 'ICSイベント',
                            start: startStr,
                            end: endStr,
                            progress: 0,
                            isIcs: true,
                            custom_class: 'ics-task'
                        });
                    }
                }
            } catch (e) {
                console.warn('ICS読み込み失敗:', normalized, e);
            }
        }

        // 開始日昇順でソート
        out.sort((a, b) => new Date(a.start) - new Date(b.start));
        return out;
    }

    /* ---------------------------------------------------------- */

    return {
        init: () => loadTasks(true),
        addOrUpdateTask,
        deleteTask,
        clearSelection,
        updateTask
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    document.getElementById("startDate").value = formatDate(today);
    document.getElementById("endDate").value = formatDate(tomorrow);

    GanttApp.init();

    document.getElementById("addOrUpdateBtn").addEventListener("click", () => GanttApp.addOrUpdateTask());
    document.getElementById("deleteBtn").addEventListener("click", () => GanttApp.deleteTask());
    document.getElementById("cancelBtn").addEventListener("click", () => GanttApp.clearSelection());

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
        localStorage.removeItem("authUser");
        sessionStorage.removeItem("authUser");
        window.location.href = "index.html";
    });
    menuIcs.addEventListener('click', () => {
        window.location.href = "ics_setting.html";
    });
});

function formatDate(date) {
    return date.toISOString().split('T')[0];
}
