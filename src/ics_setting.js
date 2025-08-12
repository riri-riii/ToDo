const username = localStorage.getItem("authUser") || sessionStorage.getItem("authUser");
if (!username) window.location.href = "../index.html";

const ICS_KEY = `icsCalendars:${username}`;

const btnAdd = document.getElementById('btnAdd');
const btnBack = document.getElementById('btnBack');
const list = document.getElementById('icsList');

function loadSources(){
  try{
    const raw = localStorage.getItem(ICS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}

function saveSources(arr){
  localStorage.setItem(ICS_KEY, JSON.stringify([...new Set(arr)].filter(Boolean)));
}

function render(){
  const sources = loadSources();
  list.innerHTML = '';
  if (sources.length === 0){
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = '登録されたカレンダーはありません。';
    list.appendChild(li);
    return;
  }
  for(const url of sources){
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = url;
    const right = document.createElement('span');
    const btn = document.createElement('button');
    btn.textContent = '取り込み解除';
    btn.className = 'danger';
    btn.addEventListener('click', () => {
      const next = sources.filter(u => u !== url);
      saveSources(next);
      render();
    });
    right.appendChild(btn);
    li.appendChild(left);
    li.appendChild(right);
    list.appendChild(li);
  }
}

btnAdd.addEventListener('click', () => {
  const input = window.prompt('取り込みたい ICS / webcal の URL を入力してください。\n例) https://example.com/calendar.ics');
  if (!input) return;
  let url = String(input).trim();
  url = url.replace(/^webcal:\/\//i, 'https://');
  try{
    const current = loadSources();
    current.push(url);
    saveSources(current);
    render();
  }catch{
    alert('保存に失敗しました。');
  }
});

btnBack.addEventListener('click', () => {
  window.location.href = './main.html';
});

render();
