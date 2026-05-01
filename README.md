# PolyBool2D

> 建築の受圧面積算定などを目的とする **2D ポリゴン CAD Web アプリ**。
> A static **2D polygon CAD web app** for area calculation (built for architectural / structural use cases).

ブラウザだけで動作する静的 SPA。サーバー不要。SVG ベースの作図、頂点編集、ブーリアン演算
（union / difference）、ナイフ分割、面積算定、JSON エクスポート / インポートを備えます。

---

## 主な機能 / Features

- ✏️ ポリゴン・矩形・円の作図 / draw polygons, rectangles, circles
- 🖱 頂点ハンドルのドラッグと座標数値編集 / drag and numeric vertex editing
- ➕ 結合 (Union) / ✂️ くり抜き (Difference) / 🔪 ナイフ分割 (Knife split)
- 📐 Shoelace 面積計算（穴あき対応, m² 表示）
- ↩️ Undo / Redo (Ctrl/⌘+Z / Ctrl/⌘+Shift+Z)
- 💾 localStorage 自動保存 + JSON エクスポート / インポート
- 🌗 ライト / ダークモード切替（永続化）
- 🌐 多言語対応: 日本語（既定）/ English
- 📖 ヘッダーから多言語対応の操作マニュアルを表示

---

## 技術スタック / Stack

- React 18 + TypeScript + Vite 5
- Zustand（状態管理）
- `polygon-clipping`（ブーリアン演算アダプター越し）
- `react-i18next` + `react-markdown`
- Vitest（単体テスト）

---

## 開発 / Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run typecheck
npm run build        # dist/ に静的サイト生成
npm run preview
```

ディレクトリ構成は `src/geometry`（純粋関数）, `src/app`（状態）,
`src/components`（UI）, `src/tools` 等に分離されています。
**幾何ライブラリは `src/geometry/geometryEngine.ts` のアダプター越しにのみ呼ぶ**
というルールで、UI から `polygon-clipping` を直接 import してはいけません。

---

## GitHub Pages へのデプロイ / Deploy

1. リポジトリ Settings → Pages → "Source" を **GitHub Actions** に設定
2. `main` に push すると `.github/workflows/deploy.yml` が自動実行
3. `vite.config.ts` の `base` は `GITHUB_REPOSITORY` 環境変数からリポジトリ名を取得して
   `/<repo>/` に解決されます。ローカル開発時は `/`。

ユーザーまたは組織のルートページ (`https://<user>.github.io/`) に公開する場合は
`GITHUB_REPOSITORY` を設定せず、`base: '/'` のままで動作します。

---

## キーボードショートカット / Shortcuts

| Action | Key |
| --- | --- |
| Select | `V` |
| Pan | `H` |
| Polygon | `P` |
| Rectangle | `R` |
| Circle | `C` |
| Knife | `K` |
| Confirm | `Enter` |
| Cancel | `Esc` |
| Delete | `Delete` / `Backspace` |
| Undo / Redo | `Ctrl/⌘+Z` / `Ctrl/⌘+Shift+Z` |
| Toggle grid | `G` |
| Toggle snap | `S` |

---

## 単位 / Units

- 内部座標単位: **mm** （Internal coords: mm）
- 表示面積単位: **m²** （`m² = mm² / 1,000,000`）

---

## JSON エクスポート / インポート

- ヘッダーの **エクスポート / Export**: `cad-project-YYYYMMDDTHHMM.json` をダウンロード
- **インポート / Import**: 同形式の JSON を読み込んで復元
- ローカルストレージに自動保存されます（タブを閉じても次回起動時に復元）

---

## 既知の制限 / Known limitations

- ナイフ機能は MVP として **単純ポリゴン × 1 直線 × 2 交点** のケースのみ
  （The knife splits only simple polygons with a single straight line crossing the outer ring at exactly 2 points.）
- 自己交差ポリゴンはサポートしません
- 円は多角形近似（既定 64 分割）として保存されます
- 3D / BIM 連携は対象外

---

## ライセンス / License

ご自由にお使いください（明示が必要な場合は `LICENSE` を追加してください）。
