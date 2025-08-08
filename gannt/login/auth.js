const API_BASE = 'https://ws9tfsfzbd.execute-api.ap-northeast-1.amazonaws.com';

window.addEventListener("DOMContentLoaded", () => {
    const username = localStorage.getItem("authUser") || sessionStorage.getItem("authUser");
    if (username) {
        window.location.href = "./main.html";
    }
});

// ログインボタン
document.getElementById("loginBtn").addEventListener("click", async () => {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const remember = document.getElementById("rememberMe").checked;

    if (!username || !password) {
        alert("ユーザー名とパスワードを入力してください。");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        if (res.ok) {
            const result = await res.json();

            const storage = remember ? localStorage : sessionStorage;
            storage.setItem("authUser", result.username);

            window.location.href = "./main.html";
        } else {
            const result = await res.json();
            alert("ログイン失敗：" + result.message);
        }
    } catch (error) {
        console.error("ログイン処理中にエラーが発生しました", error);
        alert("ログイン失敗：ネットワークエラーの可能性があります。");
    }
});



// アカウント登録ボタン
document.getElementById("registerBtn").addEventListener("click", () => {
    window.location.href = "login/register.html";
});