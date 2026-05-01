# PolyBool2D

PolyBool2D is a browser-only 2D polygon CAD web app for drawing planar shapes,
running polygon boolean operations, splitting shapes, and calculating area.

PolyBool2D は、ブラウザだけで動作する 2D ポリゴン CAD Web アプリです。
建築・構造・設計検討などで扱う平面領域をポリゴンとして作図・編集し、
面積を確認するための軽量な静的 SPA として作られています。

> 重要: PolyBool2D は作図と面積確認を補助するためのツールです。法規、
> 構造安全性、契約、施工、その他の重要な判断に使う場合は、責任者による
> 確認と、信頼できる CAD・構造計算・設計支援ツールでの検証を行ってください。

## 現在の位置づけ

- バックエンドを持たない静的 Single Page Application です。
- 既定の座標単位は `mm`、面積表示は `m²` です。
- 主な形状モデルは、外周リングと穴リングを持つポリゴンです。
- ブーリアン演算は `polygon-clipping` を使い、アプリ側からは自前の
  ジオメトリアダプター越しに呼び出します。
- プロジェクトはブラウザの `localStorage` に自動保存し、JSON として
  インポート・エクスポートできます。

## 主な機能

### 作図とナビゲーション

- SVG ベースの CAD ビューポート。
- マウスホイールによるズーム、パンツール・中ボタン・`Space` + ドラッグによるパン。
- ポリゴン、矩形、円の作図。
- 矩形作図時の `Shift` 正方形拘束。
- 円は多角形近似として保存。
- グリッド表示。
- グリッド、既存頂点、辺上、辺の中点へのスナップ。

### 編集

- 単一選択と `Shift` クリックによる複数選択。
- 選択ポリゴンの頂点ハンドルをドラッグして座標を移動。
- プロパティパネルで外周頂点の X/Y 座標を数値編集。
- ツールバーまたはキーボードによる選択エンティティ削除。
- Undo / Redo。

### ジオメトリ操作

- Union: 2 つ以上の選択ポリゴンを結合。
- Difference: 最初に選択した対象ポリゴンから、後続の選択ポリゴンを差し引き。
- Knife split: 単純ポリゴンを、外周とちょうど 2 点で交差する 1 本の直線で分割。
- 面積計算: 外周面積から穴面積を差し引いた実面積を表示。
- ジオメトリ層に、正規化、交差判定、自己交差検出、極小リング判定などの純粋関数を配置。

### プロジェクトと UI

- `localStorage` への自動保存。
- JSON ファイルのインポート・エクスポート。
- ライト / ダークテーマ。
- 日本語 / 英語 UI。
- ヘッダーから開けるアプリ内マニュアル。

## 操作

| 操作 | 入力 |
| --- | --- |
| 選択ツール | `V` |
| パンツール | `H` |
| ポリゴンツール | `P` |
| 矩形ツール | `R` |
| 円ツール | `C` |
| ナイフツール | `K` |
| ポリゴン作図を確定 | `Enter` |
| 作図プレビューをキャンセル | `Esc` |
| 選択エンティティを削除 | `Delete` / `Backspace` |
| 元に戻す | `Ctrl/⌘ + Z` |
| やり直し | `Ctrl/⌘ + Shift + Z` |
| グリッド ON/OFF | `G` |
| スナップ ON/OFF | `S` |
| ズーム | マウスホイール |
| パン | パンツール、中ボタンドラッグ、`Space` + ドラッグ |
| 矩形を正方形に拘束 | 矩形ドラッグ中に `Shift` |
| 複数選択 | `Shift` + クリック |

## ジオメトリ仕様

共有型は `src/geometry/types.ts` にあります。

```ts
type Point = { x: number; y: number };
type Ring = Point[];

type PolygonGeometry = {
  outer: Ring;
  holes: Ring[];
};

type MultiPolygonGeometry = PolygonGeometry[];
```

実装上のルール:

- リングは閉じ点を重複保存しません。末尾に始点を繰り返さない open ring です。
- 正規化では座標を小数 9 桁に丸め、隣接重複点を削除します。
- 外周リングは反時計回り、穴リングは時計回りに揃えます。
- 面積は Shoelace formula で計算します。大きな座標オフセットでの丸め誤差を
  抑えるため、ローカル原点への平行移動と補償和を使います。
- `pointInRing` は境界上の点を内側として扱います。
- UI からブーリアン演算ライブラリを直接 import しないでください。
  `src/geometry/geometryEngine.ts` のアダプター越しに呼び出します。

## プロジェクト JSON 仕様

エクスポートされるプロジェクトはプレーンな JSON です。ルート構造は
`src/app/projectTypes.ts`、読み込み時の検証は
`src/persistence/projectSerializer.ts` にあります。

主なトップレベル項目:

- `id`, `name`, `version`
- `unit`: `mm`, `cm`, `m`
- `createdAt`, `updatedAt`
- `settings`: グリッド、スナップ、表示精度、円近似分割数など
- `layers`: レイヤー情報
- `entities`: ポリゴンエンティティ、ガイドラインエンティティ

ポリゴンエンティティの主な項目:

- `geometry.outer`: 外周リング
- `geometry.holes`: 穴リング配列
- `style`: 塗り、線、線幅、透明度
- `metadata`: 元形状や生成操作の履歴情報

対応バージョン外の JSON、不正な JSON、不正な形状データは読み込まずに拒否します。

## ファイル構成

```text
.
├── .github/workflows/
│   ├── ci.yml                 # typecheck, tests, production build
│   └── deploy.yml             # GitHub Pages deployment
├── public/
│   └── favicon.svg
├── src/
│   ├── app/                   # アプリ状態、プロジェクトモデル、履歴、ビュー変換
│   ├── components/
│   │   ├── cad/               # SVG ビューポート、グリッド、図形、ハンドル、プレビュー
│   │   └── layout/            # ヘッダー、ツールバー、パネル、ステータスバー、マニュアル
│   ├── geometry/              # 純粋な幾何関数とブーリアン演算アダプター
│   ├── i18n/                  # 翻訳 JSON とアプリ内マニュアル
│   ├── persistence/           # localStorage と JSON import/export
│   ├── styles/                # グローバル CSS とテーマ変数
│   ├── tests/                 # Vitest 単体テスト
│   └── main.tsx               # React エントリーポイント
├── index.html
├── package.json
├── tsconfig*.json
└── vite.config.ts
```

ジオメトリ関連の主要ファイル:

- `src/geometry/types.ts`: 共有ジオメトリ型。
- `src/geometry/area.ts`: リング、ポリゴン、マルチポリゴンの面積と重心。
- `src/geometry/numeric.ts`: 数値許容誤差、clamp、距離、補償和などの共通処理。
- `src/geometry/intersections.ts`: 線分交差、点の内外判定。
- `src/geometry/normalize.ts`: 座標丸め、リング整理、向きの正規化。
- `src/geometry/validation.ts`: 形状検証。
- `src/geometry/knifeSplit.ts`: ナイフ分割。
- `src/geometry/polygonClippingEngine.ts`: `polygon-clipping` アダプター。

## 開発

必要なもの:

- Node.js 22 または互換性のある現行 LTS。
- npm。

セットアップ:

```bash
npm ci
npm run dev
```

Vite の開発サーバーは既定で `http://localhost:5173` に起動します。

よく使うコマンド:

```bash
npm run typecheck   # TypeScript の型チェック
npm test            # Vitest 単体テスト
npm run build       # dist/ に本番ビルドを生成
npm run preview     # 生成済みビルドのプレビュー
```

## テストと CI

単体テストは `src/tests` にあります。現在は主に次を検証しています。

- 面積計算
- 線分交差
- 正規化
- バリデーション
- ブーリアン演算
- ナイフ分割
- プロジェクトシリアライズ

GitHub Actions では Pull Request と `main` への push に対して、typecheck、
テスト、本番ビルドを実行します。

## GitHub Pages へのデプロイ

`.github/workflows/deploy.yml` に GitHub Pages 用のワークフローがあります。

1. リポジトリ Settings の Pages source を GitHub Actions に設定します。
2. `main` に push します。
3. ワークフローが依存関係のインストール、テスト、ビルドを実行し、`dist/` を
   GitHub Pages にデプロイします。

`vite.config.ts` は `GITHUB_REPOSITORY` から `base` パスを決定します。
そのため `https://<owner>.github.io/<repo>/` 形式の Project Pages でも、
リポジトリ名をコードに固定せずに動作します。

## 既知の制限

- ナイフツールは、穴のない単純ポリゴンを 1 本の直線で 2 交点分割するケースのみ対応します。
- 自己交差ポリゴンは未対応です。
- 円は多角形近似です。既定は 64 分割です。
- 頂点の追加と頂点単位の削除は未実装です。
- 多くのプロジェクト設定は、専用 UI ではなくコードまたはインポート JSON 経由で扱います。
- DXF / DWG / SVG エクスポート、3D、BIM、バックエンド共同編集機能はありません。
- ブラウザの `localStorage` はバックアップではありません。重要な作業は JSON として
  エクスポートしてください。

## プライバシー

PolyBool2D はブラウザ内で完結する設計です。プロジェクトデータはブラウザの
ローカルストレージと、ユーザーが明示的にエクスポート・インポートする JSON
ファイルに保存されます。このリポジトリにはアプリケーション用バックエンドは含まれません。

## ライセンス

現在、このリポジトリには `LICENSE` ファイルが含まれていません。再利用、再配布、
商用利用などの条件を明確にする場合は、意図するライセンスを `LICENSE` として追加してください。
