# 新セッション引き継ぎメモ(2026-07-10時点)

新しいClaude Codeセッションを始めるときは、この内容をそのまま最初のメッセージとして渡してください。

---

## 最初にすること

1. `docs/spec.md`(仕様書 v1.8)を全部読む
2. `docs/TODO.md`(マイルストーン計画+各マイルストーンの実装メモ)を全部読む。実装メモには実機で見つかった不具合とその直し方も書いてあるので、同じ罠を踏まないために必ず目を通すこと

## 現在の状況

Phase 1(MVP)のうち **M1〜M4が完了・実機確認済み**。次は **M5(案件管理)**。

- M1: Dropboxチャンクアップロード検証
- M2: 基盤・認証(招待コード+メール/パスワード、LINEは使わない)
- M3: モニター管理
- M4: Shopify連携基盤(商品検索・注文検索・クーポン監視・Webhook)

M5に入る前に、`docs/TODO.md`のM5セクションを見て、作成するファイル・画面・テーブルの一覧をAzusaさんに提示し、承認を得てから着手すること(これまでのマイルストーンも同じ進め方をしている)。

## 絶対に守ること(仕様書冒頭の指示を継続)

- 仕様書と矛盾する実装をしない。曖昧・矛盾があれば必ず質問する(勝手に解釈しない)
- Dropbox / Shopify のシークレットは Supabase Edge Functions の Secrets のみ。クライアントに埋め込まない
- 全テーブルに RLS
- UIは仕様書14章のデザイントークンに厳密に従う。NativeWindのtailwind.config.jsに一元定義済み、画面側でのhexベタ書き禁止
- TypeScript strict。DBの型は `npx supabase gen types typescript --linked > lib/database.types.ts` で生成
- 動画・写真は端末側で再圧縮しない。EXIFのGPS情報のみ除去
- 1マイルストーンずつ「作成物提示→承認→実装→実機確認→OK→次へ」。まとめて作らない
- マイルストーン完了ごとに git commit(+ push)。`docs/TODO.md`にも完了マークと実装メモを残す

## 技術的な注意点(ハマりどころ)

- **プロジェクトはDropbox同期フォルダ内**にある(`azusa ( anoko. )\Claude\anoko-monitorapp`)。`node_modules` / `.git` / `.expo` はNTFS拡張属性でDropbox同期対象外に設定済み(`Set-Content -Path <dir> -Stream com.dropbox.ignored -Value 1` で確認・再設定可能)。`npm install`等で新しく`node_modules`が作られた場合は再設定が必要
- **Expo SDKは54**(57ではない)。実機のExpo Goアプリが対応しているのがSDK54までだったため意図的にダウングレードしている。SDKを上げる時は先にExpo Go側の対応バージョンを確認すること
- **Dropboxアップロードは`fetch`+Blobではなく`FileSystem.uploadAsync`(一時ファイル書き出し)方式**(`lib/dropbox.ts`)。React NativeのfetchはBlob/ArrayBufferボディに対応していないため
- **Shopifyは2026年1月からDev Dashboard必須**になり、Admin APIアクセストークンは1回表示ではなく`client_credentials`グラントで都度取得(24時間有効)。`supabase/functions/_shared/shopify.ts`が共通のトークン取得処理。Secretsは`SHOPIFY_STORE_DOMAIN` / `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`の3つ(`SHOPIFY_API_SECRET`はWebhookのHMAC検証にも使う同じ値)
- ヘッダーなし画面(Stack.Screen options={{headerShown:false}})は`components/Screen.tsx`(SafeAreaView)を使うこと。素の`View`だとノッチに被る・中央寄せが効かない不具合があった
- Supabaseの`db push`実行時、Docker未起動の警告が出るが無視してよい(実際の反映には影響しない)

## 認証情報の設定状況

- Supabase: プロジェクトリンク済み(project ref: `mxenfgoviwxnlhokfvwc`)、`.env`にURL/anon keyあり
- Dropbox Secrets: 設定済み(App folder方式。案件フォルダは`/Apps/{アプリ名}/`配下固定。スタッフに見せる場合はAzusaさんがDropbox共有機能で共有する運用)
- Shopify Secrets: 設定済み(`SHOPIFY_STORE_DOMAIN` / `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`)、`orders/create` Webhook購読も登録済み
- 初期管理者アカウント: 作成済み(Supabase Authユーザー+`profiles`行紐付け済み)

**シークレットのやり取りルール**: 新しい認証情報が必要になったら、値そのものをこのチャットに貼らせないこと。`npx supabase secrets set KEY="value"`のような形でAzusaさん自身のターミナルから実行してもらう。どうしても動作確認したい場合は、値を表示せず成功/失敗や件数だけを返すやり方で確認する(このセッションでも何度か秘密情報が誤って貼られる事故があったので特に注意)。

## Gitの状態

- リモート: `https://github.com/anoko-baby/monitor-app.git`、ブランチは`main`
- 自動モードの安全装置により、無人実行中の`main`への直pushがブロックされる場面があった。ユーザーとやり取りしながら進めている間は明示的に許可を得てpushして問題ない
- `overnight-m2-wip`という退避用ブランチが残っているが、既に`main`にマージ済みの内容なので削除して問題ない

## 次にやること

`docs/TODO.md`のM5セクション(案件管理)を読み、作成するファイル・画面・テーブルの一覧をAzusaさんに提示してから着手する。
