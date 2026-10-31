# newdcg — 1対1デジタルカードゲーム プロトタイプ

**▶ ブラウザで遊ぶ: https://vording.github.io/newdcg/**

仕様書 v0.3 の基本ルール（ターン進行・マナ・召喚・攻撃・ブロック・蓄積ダメージ・勝敗判定）を実装した最小プロトタイプです。

## 必要環境

- Node.js 18 以上（外部依存パッケージなし。`npm install` 不要）
- モダンブラウザ（UIで遊ぶ場合）

## 使い方

```bash
npm test                 # ルールエンジンのテスト
npm run simulate         # AI同士の総当たりで勝率・試合の長さ・接戦率などを計測
node scripts/skill-check.js  # 実力差が勝敗に反映されるか確認
npm run serve            # http://localhost:8080/ でブラウザUIを起動
npm run build            # dist/dcg.html（1ファイルで遊べる版）を生成
npm run build:pages      # index.html（GitHub Pages 用）を生成
```

シミュレーションは未確定ルールの設定を切り替えて比較できます。

```bash
node scripts/simulate.js 2000 '{"exhaustedCanBlock":true}'
```

## ブラウザUIの操作

- **手札**：緑枠のカードがプレイ可能。クリックで召喚／スペル使用（スペルは対象をクリック）。灰色のカードはマウスオーバーで使えない理由を表示。
- **攻撃**：攻撃可能な自分のクリーチャー（緑枠）をクリックで選択 →「攻撃」。攻撃せず終わる場合は「ターン終了」。
- **ブロック**：自分のクリーチャーを選択 → 止めたい攻撃クリーチャー（赤枠）をクリック →「ブロック確定」。
- クリーチャーには `残りHP/最大HP`・HPバー・蓄積ダメージ量・行動済み／召喚酔いを表示。
- 対戦形式は「CPU対戦」または「2人対戦（同じ画面）」。

## 構成

```
src/engine/   ゲームロジック（UI非依存・DOM不使用）
  config.js   調整可能なルールパラメータ（暫定値・未確定ルールのスイッチ）
  cards.js    カードデータ（18種）・構築済みデッキ・デッキ検証
  effects.js  カード効果のレジストリと対象選択
  state.js    状態操作ヘルパー（ダメージ・ドロー・乱数）
  game.js     ターン進行・アクション適用・戦闘・状態起因処理
src/ai/       動作確認用の単純なAI
src/ui/       ブラウザUI（エンジンを呼ぶだけ）
scripts/      シミュレーター・静的サーバー
test/         node:test によるテスト
docs/         ルール整理・未確定事項・開発レポート
```

- [docs/rules.md](docs/rules.md) — 実装したルールの整理
- [docs/open-questions.md](docs/open-questions.md) — **仕様上の未確定事項（要確認）**
- [docs/report.md](docs/report.md) — 技術方針・テスト結果・問題点と改善案
- [docs/balance-report.md](docs/balance-report.md) — 自動テストによるバランス調整の記録

## 公開（GitHub Pages）

GitHub Pages はブランチ直下を公開する設定になっており、リポジトリ直下の `index.html`（ビルド済みの1ファイル版）が配信されます。
カードやルールを変えたら `npm run build:pages` で `index.html` を作り直してコミットしてください。
作り直し忘れは `npm test` で検出されます。
