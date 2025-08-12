import Gantt from './src/index.js';

const API_BASE = 'https://ws9tfsfzbd.execute-api.ap-northeast-1.amazonaws.com';
const username = localStorage.getItem("authUser") || sessionStorage.getItem("authUser");
if (!username) window.location.href = "index.html";

/* ユーザーごとの ICS 設定キー */
const ICS_KEY = `icsCalendars:${username}`;

/* ICS プロキシのエンドポイント（Lambda/API Gateway 側が /tasks_icsimport で実装されている前提） */
const ICS_GET_ENDPOINT = `${API_BASE}/tasks_icsimport`;

const GanttApp = (() => {
    let awsTasks = [];       /* AWS由来（編集可／登録・更新あり） */
    let taskList = [];       /* 表示用（AWS + ICSのマージ） */
    let ganttInstance = null;
    let selectedTaskId = null; /* 画面上の選択状態は CSS セーフIDで保持 */

    /* CSSセレクタ安全なトークンに正規化（. @ / : などを _ に置換。先頭が数字なら接頭辞を付与） */
    function toCssToken(s) {
        if (typeof s !== 'string') s = String(s ?? '');
        let token = s.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (!/^[a-zA-Z_]/.test(token)) token = `t_${token}`;
        return token;
    }

    /* UTF-8 を base64 に（日本語を含む文字列でも失敗しない） */
    function b64utf8(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    async function loadTasks(scrollToToday = false) {
        /* AWS（書き込み可能）タスクのみ先に取得して保持 */
        const res = await fetch(`${API_BASE}/tasks?username=${encodeURIComponent(username)}`);
        const raw = await res.json();

        /* 描画用 id は CSS セーフ化。元IDは orig_id として保持（更新・削除に使用） */
        awsTasks = raw.map(t => ({
            id: toCssToken(t.ID),
            orig_id: t.ID,
            name: t.name,
            start: t.start,
            end: t.end,
            progress: t.progress
        }));

        await render({ scrollToToday }); /* ← render()の中でICSを読み込む */
        await afterFirstVisibleScroll();
    }

    async function afterFirstVisibleScroll(){
        /* 以降は最初に見えるべきタスクまで縦スクロール */
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
        /* 表示期間（過去14日～未来180日） */
        const today = new Date();
        const past = new Date(today); past.setDate(today.getDate() - 14);
        const future = new Date(today); future.setDate(today.getDate() + 180);

        /* ICS（読み取り専用）タスクは render() の中で都度ロード */
        const icsTasks = await loadIcsTasks(past, future);

        /* 表示対象の期間でフィルタしマージ */
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
                    /* ICS タスクは編集不可 */
                    if (task.isIcs) {
                        clearSelection();
                        return;
                    }
                    selectedTaskId = task.id; /* ← ここは CSS セーフID */
                    document.getElementById("taskName").value = task.name;
                    document.getElementById("startDate").value = task.start;
                    document.getElementById("endDate").value = task.end;
                    document.getElementById("addOrUpdateBtn").textContent = "タスクを更新";
                    document.getElementById("deleteBtn").style.display = "inline-block";
                    document.getElementById("cancelBtn").style.display = "inline-block";
                },
                on_date_change: async (task, start, end) => {
                    /* ICS タスクはドラッグ等で日付変更不可（即時戻す） */
                    if (task.isIcs) {
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
                    if (task.isIcs) return; /* ICS は操作アクション無し */
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
        /* 更新時は orig_id（なければ id）を使用 */
        await fetch(`${API_BASE}/tasks/${task.orig_id ?? task.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ID: task.orig_id ?? task.id,
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
            clearSelection();
            return;
        }
        const targetId = task?.orig_id ?? selectedTaskId;
        await fetch(`${API_BASE}/tasks/${targetId}`, {
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

    /* --- ICS 関連（シンプルパーサ + プロキシ経由） ---------- */

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

    /* ここを修正：UTF-8 base64 → 記号除去 → CSS セーフ化 */
    function makeIcsTaskId(url, startStr, endStr, summary) {
        const base = `${url}__${startStr}__${endStr}__${summary}`;
        let enc = '';
        try { enc = b64utf8(base); } catch { enc = base; }
        const compact = enc.replace(/[+/=]/g, ''); /* URL安全化（/ + = を削る） */
        return toCssToken(`ics_${compact}`);       /* 最後にCSSセーフ化 */
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
        if (isNaN(dt.getTime())) return null;
        return formatDate(dt);
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
                cur = { summary: '', dtstart: null, dtend: null, allDay: false };
                continue;
            }
            if (line === 'END:VEVENT') {
                if (cur && cur.dtstart) {
                    let startStr = parseIcsDate(cur.dtstart.value, cur.dtstart.allDay);
                    let endStr = parseIcsDate((cur.dtend && cur.dtend.value) || cur.dtstart.value, cur.dtend ? cur.dtend.allDay : cur.dtstart.allDay);
                    /* 終日（VALUE=DATE）は DTEND 非包含のため -1 日補正 */
                    if ((cur.dtend && cur.dtend.allDay) || (cur.dtstart && cur.dtstart.allDay)) {
                        const sd = new Date(startStr);
                        const ed = new Date(endStr);
                        if (!isNaN(ed.getTime()) && ed.getTime() > sd.getTime()) {
                            ed.setDate(ed.getDate() - 1);
                            endStr = formatDate(ed);
                        }
                    }
                    events.push({
                        summary: cur.summary || 'ICSイベント',
                        start: startStr,
                        end: endStr
                    });
                }
                cur = null;
                continue;
            }
            if (!cur) continue;

            if (line.startsWith('SUMMARY')) {
                const idx = line.indexOf(':');
                cur.summary = idx >= 0 ? line.slice(idx + 1) : line;
                continue;
            }
            if (line.startsWith('DTSTART')) {
                const idx = line.indexOf(':');
                const prop = line.slice(0, idx);
                const val = idx >= 0 ? line.slice(idx + 1) : '';
                const allDay = /VALUE=DATE/.test(prop);
                cur.dtstart = { value: val, allDay };
                cur.allDay = cur.allDay || allDay;
                continue;
            }
            if (line.startsWith('DTEND')) {
                const idx = line.indexOf(':');
                const prop = line.slice(0, idx);
                const val = idx >= 0 ? line.slice(idx + 1) : '';
                const allDay = /VALUE=DATE/.test(prop);
                cur.dtend = { value: val, allDay };
                cur.allDay = cur.allDay || allDay;
                continue;
            }
        }
        return events;
    }

    async function loadIcsTasks(past, future) {
        const sources = getIcsSources();
        const all = [];
        for (const src of sources) {
            const normalized = normalizeIcsUrl(src);
            try {
                /* 直接 fetch せずプロキシ経由。u は base64 で渡す（Lambda が base64 前提） */
                const b64 = b64utf8(normalized);
                const proxied = `${ICS_GET_ENDPOINT}?u=${encodeURIComponent(b64)}`;
                const res = await fetch(proxied, { method: 'GET' });
                if (!res.ok) throw new Error(`proxy status ${res.status}`);
                const text = await res.text();

                const events = parseICS(text);
                for (const ev of events) {
                    const endDate = new Date(ev.end);
                    /* 終了日が表示期間に入るものを採用（要件に合わせ適宜変更可） */
                    if (endDate >= past && endDate <= future) {
                        const id = makeIcsTaskId(normalized, ev.start, ev.end, ev.summary);
                        all.push({
                            id, /* CSS セーフID */
                            name: ev.summary,
                            start: ev.start,
                            end: ev.end,
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
        return all.sort((a, b) => new Date(a.start) - new Date(b.start));
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

    /* ≡ メニュー制御 */
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
