const API_BASE = 'https://ws9tfsfzbd.execute-api.ap-northeast-1.amazonaws.com';

document.getElementById("registerBtn").addEventListener("click", async () => {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
        alert("ユーザー名とパスワードを入力してください。");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, register: true })
        });

        if (res.ok) {
            alert("アカウント登録が完了しました。");
            window.location.href = "../index.html";
        } else if (res.status === 409) {
            const result = await res.json();
            alert(result.message || "このユーザー名は既に使われています。");
        } else {
            alert("登録に失敗しました。");
        }
    } catch (error) {
        console.error("アカウント登録中にエラーが発生しました", error);
        alert("登録失敗：ネットワークエラーの可能性があります。");
    }
});

document.getElementById("backBtn").addEventListener("click", () => {
    window.location.href = "../index.html";
});
