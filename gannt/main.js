import Gantt from './src/index.js';

const API_BASE = 'https://ws9tfsfzbd.execute-api.ap-northeast-1.amazonaws.com';
const username = localStorage.getItem("authUser") || sessionStorage.getItem("authUser");

if (!username) {
    window.location.href = "index.html";
}

const GanttApp = (() => {
    let taskList = [];
    let ganttInstance = null;
    let selectedTaskId = null;

    async function loadTasks(scrollToToday = false) {
        const res = await fetch(`${API_BASE}/tasks?username=${encodeURIComponent(username)}`);
        const raw = await res.json();

        const today = new Date();
        const past = new Date(today);
        past.setDate(today.getDate() - 14);
        const future = new Date(today);
        future.setDate(today.getDate() + 180);

        taskList = raw
            .map(t => ({
                id: t.ID,
                name: t.name,
                start: t.start,
                end: t.end,
                progress: t.progress
            }))
            .filter(t => {
                const endDate = new Date(t.end);
                return endDate >= past && endDate <= future;
            })
            .sort((a, b) => new Date(a.start) - new Date(b.start));

        render({ scrollToToday });

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

    function render({ scrollToToday = false } = {}) {
        if (ganttInstance) {
            ganttInstance.refresh(taskList);
            if (scrollToToday) {
                ganttInstance.scroll_current();
            }
        } else {
            ganttInstance = new Gantt("#gantt", taskList, {
                view_mode: 'Day',
                container_height: window.innerHeight - 45,
                grid_height: 30,
                today_button: true,
                auto_move_label: false,
                infinite_padding: true,
                on_click: (task) => {
                    selectedTaskId = task.id;
                    document.getElementById("taskName").value = task.name;
                    document.getElementById("startDate").value = task.start;
                    document.getElementById("endDate").value = task.end;
                    document.getElementById("addOrUpdateBtn").textContent = "タスクを更新";
                    document.getElementById("deleteBtn").style.display = "inline-block";
                    document.getElementById("cancelBtn").style.display = "inline-block";
                },
                on_date_change: async (task, start, end) => {
                    const jstStart = new Date(start.getTime() + 24 * 60 * 60 * 1000);
                    const jstEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);
                    task.start = formatDate(jstStart);
                    task.end = formatDate(jstEnd);
                    await GanttApp.updateTask(task);
                    ganttInstance.refresh(taskList);
                },
                popup: ({ task, set_title, set_subtitle, set_details, add_action }) => {
                    set_title(task.name);
                    set_subtitle(`${task.start} ～ ${task.end}`);
                    set_details(`進捗: ${task.progress}%`);

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
                    container_height: window.innerHeight - 45
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
            Object.assign(task, { name, start, end });
            await updateTask(task);
        } else {
            const utcNow = new Date();
            const newTask = {
                ID: new Date(utcNow.getTime() + 9 * 60 * 60 * 1000).toISOString().replace(/[-:T]/g, '').replace('.', '').slice(2, 16),
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
    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("authUser");
        sessionStorage.removeItem("authUser");
        window.location.href = "index.html";
    });
});

function formatDate(date) {
    return date.toISOString().split('T')[0];
}
