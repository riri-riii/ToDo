// ics_setting.js (replaced to use API Gateway + DynamoDB)
// 要件: Tasks_ics (PK: user, SK: ics_url) に対する登録/更新(UPSERT)・削除・一覧取得
// 備考:
// - 認証ユーザー名は従来どおり localStorage/sessionStorage の "authUser" を使用
// - API Gateway エンドポイントは下の ICS_API_BASE を環境に合わせて設定
// - トークン運用がある場合は localStorage "authToken" を Bearer で自動付与（任意）

const username = localStorage.getItem("authUser") || sessionStorage.getItem("authUser");
if (!username) window.location.href = "index.html";


const ICS_API_BASE = "https://ws9tfsfzbd.execute-api.ap-northeast-1.amazonaws.com/tasks_icsimport";
// ===============================================
// 既存HTMLの要素参照（IDは従来どおり）
const btnAdd = document.getElementById('btnAdd');
const btnBack = document.getElementById('btnBack');
const list = document.getElementById('icsList');

// 共通ヘッダ（任意: 認証トークンがあれば付与）
function buildHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extra
  };
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ---- API 呼び出し ----

// 一覧取得: GET {ICS_API_BASE}?user={username}
// 返却想定: { items: [{ user: "...", ics_url: "..." }, ...] }
async function fetchIcsList() {
  const url = `${ICS_API_BASE}?user=${encodeURIComponent(username)}`;
  const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const data = await res.json();
  // 後方互換: 配列のみ or items配列の両対応
  const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
  return items.map(it => it.ics_url).filter(Boolean);
}

// 追加/更新(UPSERT): PUT {ICS_API_BASE}  body: { user, ics_url }
async function upsertIcsUrl(icsUrl) {
  const body = JSON.stringify({ user: username, ics_url: icsUrl });
  const res = await fetch(ICS_API_BASE, { method: 'PUT', headers: buildHeaders(), body });
  if (!res.ok) throw new Error(`Failed to upsert: ${res.status}`);
  // サーバ側で既存に同値があっても UPSERT（PutItem）される想定
}

// 削除: DELETE {ICS_API_BASE}  body: { user, ics_url }
async function deleteIcsUrl(icsUrl) {
  const body = JSON.stringify({ user: username, ics_url: icsUrl });
  const res = await fetch(ICS_API_BASE, { method: 'DELETE', headers: buildHeaders(), body });
  if (!res.ok) throw new Error(`Failed to delete: ${res.status}`);
}

// ---- 画面描画 ----

async function render() {
  list.innerHTML = '';
  // ローディング表示
  const loadingLi = document.createElement('li');
  const urlDiv = document.createElement('div');
  urlDiv.className = 'url';
  urlDiv.textContent = '読み込み中...';
  const actions = document.createElement('div');
  actions.className = 'actions';
  loadingLi.appendChild(urlDiv);
  loadingLi.appendChild(actions);
  list.appendChild(loadingLi);

  try {
    const sources = await fetchIcsList();
    list.innerHTML = '';

    if (sources.length === 0) {
      const li = document.createElement('li');
      const urlDiv2 = document.createElement('div');
      urlDiv2.className = 'url';
      urlDiv2.textContent = '登録されたカレンダーはありません。';
      urlDiv2.style.color = '#6b7280';
      const actions2 = document.createElement('div');
      actions2.className = 'actions';
      li.appendChild(urlDiv2);
      li.appendChild(actions2);
      list.appendChild(li);
      return;
    }

    for (const url of sources) {
      const li = document.createElement('li');

      const urlDiv3 = document.createElement('div');
      urlDiv3.className = 'url';
      urlDiv3.textContent = url;

      const actions3 = document.createElement('div');
      actions3.className = 'actions';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-danger';
      removeBtn.textContent = '取り込み解除';
      removeBtn.addEventListener('click', async () => {
        try {
          await deleteIcsUrl(url);
          await render();
        } catch (e) {
          console.error(e);
          alert('削除に失敗しました。');
        }
      });

      actions3.appendChild(removeBtn);
      li.appendChild(urlDiv3);
      li.appendChild(actions3);
      list.appendChild(li);
    }
  } catch (e) {
    console.error(e);
    list.innerHTML = '';
    const li = document.createElement('li');
    const urlDiv4 = document.createElement('div');
    urlDiv4.className = 'url';
    urlDiv4.textContent = '読み込みに失敗しました。接続設定を確認してください。';
    urlDiv4.style.color = '#b91c1c';
    const actions4 = document.createElement('div');
    actions4.className = 'actions';
    li.appendChild(urlDiv4);
    li.appendChild(actions4);
    list.appendChild(li);
  }
}

// ---- イベント ----

btnAdd.addEventListener('click', async () => {
  const input = window.prompt('取り込みたい ICS / webcal の URL を入力してください。\n例) https://example.com/calendar.ics');
  if (!input) return;
  let url = String(input).trim();
  url = url.replace(/^webcal:\/\//i, 'https://'); // webcal → https

  // 簡易バリデーション
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw 0;
  } catch {
    alert('URLの形式が正しくありません。');
    return;
  }

  try {
    await upsertIcsUrl(url); // PutItem 相当（存在すれば更新・なければ新規）
    await render();
  } catch (e) {
    console.error(e);
    alert('保存に失敗しました。');
  }
});

btnBack.addEventListener('click', () => {
  window.location.href = 'main.html';
});

// 初期描画
render();
