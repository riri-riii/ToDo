const username = localStorage.getItem("authUser") || sessionStorage.getItem("authUser");
if (!username) window.location.href = "index.html";

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
    const urlDiv = document.createElement('div');
    urlDiv.className = 'url';
    urlDiv.textContent = '登録されたカレンダーはありません。';
    urlDiv.style.color = '#6b7280';
    const actions = document.createElement('div');
    actions.className = 'actions';
    li.appendChild(urlDiv);
    li.appendChild(actions);
    list.appendChild(li);
    return;
  }

  for(const url of sources){
    const li = document.createElement('li');

    const urlDiv = document.createElement('div');
    urlDiv.className = 'url';
    urlDiv.textContent = url;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger';
    removeBtn.textContent = '取り込み解除';
    removeBtn.addEventListener('click', () => {
      const next = sources.filter(u => u !== url);
      saveSources(next);
      render();
    });

    actions.appendChild(removeBtn);
    li.appendChild(urlDiv);
    li.appendChild(actions);
    list.appendChild(li);
  }
}

btnAdd.addEventListener('click', () => {
  const input = window.prompt('取り込みたい ICS / webcal の URL を入力してください。\n例) https://example.com/calendar.ics');
  if (!input) return;
  let url = String(input).trim();
  url = url.replace(/^webcal:\/\//i, 'https://'); // webcal → https
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
  window.location.href = 'main.html';
});

render();
