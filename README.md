# ToDo (Frappe Gantt ベース)

このプロジェクトは `frappe-gantt` を使った ToDo / ガントチャートアプリです。

## 画面構成

- `main.html` : ガントチャート画面
- `task_list.html` : タスクリスト画面（一覧）
- `task_form.html` : タスク登録・編集画面

### タスク項目

- 必須: タスク名 / 予定開始日 / 予定終了日 / 進捗（0〜100%を20%刻み）
- 任意: 実開始日 / 実終了日 / 予定工数 / 実工数

## ローカル確認

```bash
python3 -m http.server 8080
```

その後 `http://localhost:8080` にアクセス。

---

This was created using frappe-gantt.

Copyright (c) 2024 Frappe Technologies Pvt. Ltd.
Licensed under the MIT License.
