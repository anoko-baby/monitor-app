# Phase 1(MVP)マイルストーン計画

仕様書 [docs/spec.md](./spec.md) (v1.8) の第11章 Phase1 を、以下9マイルストーンに分解する。
1つずつ「実装 → 実機確認 → OK後に次へ」で進める。まとめて作らない。

v1.7からの主な変更(v1.8): LINEログイン/LINE通知を全廃止(モニター認証は招待コード+メール/パスワード、通知はPushのみ)。Shopify連携(商品検索・注文取込・クーポン注文検知/案件化)・モニター実績・お知らせ配信(全モニター/個別選択)をPhase1に前倒し。この結果、当初想定の6〜8個ではなく9個になっている。

---

## M1. Dropboxチャンクアップロードの単体検証 【最大の技術リスク】 ✅完了(2026-07-10)

このプロジェクトで最初に潰すべき不確実性。本体画面は作らず、検証用の仮画面1枚のみ。

- Expo プロジェクト scaffold(Expo Router, TypeScript strict, NativeWind + 14章トークン骨格)
- Supabase プロジェクト連携 + Edge Function 1本(`dropbox-token`: リフレッシュトークンから短命アクセストークンを発行)
- Dropbox Scoped App 連携(App Key/Secret・リフレッシュトークンをSupabase Secretsに保存)
- 検証用画面1枚: 動画選択 → `upload_session`(8MBチャンク)でアップロード → 進捗表示 → 完了後に共有リンク生成・表示

**完了条件(実機・iPhone・Expo Go)**
- 500MB以上の動画を選択してアップロードを開始できる
- アップロード中に進捗(%)が表示される
- 機内モードONで通信を切ると中断し、OFFに戻すと**セッションIDから続きから**再開する(最初からやり直しにならない)
- 完了後、Dropbox共有リンクがアプリ内に表示され、リンクを開いて実際にその動画を確認できる

**実機検証結果メモ**
- iPhone・Expo Go・1.28GBの動画(.mov)で確認。8MBチャンクでのDropbox `upload_session`アップロードが完走し、共有リンクから実際の動画を確認できた
- React NativeのfetchはBlob/ArrayBufferボディに未対応のため、`file.slice()` → Blobをfetch bodyに渡す方式は実機で失敗した(`Creating blobs from 'ArrayBuffer' ... are not supported`)。チャンクを一時ファイルに書き出し`FileSystem.uploadAsync`(ネイティブ実装)で送る方式に変更して解決(`lib/dropbox.ts`)
- 機内モード中断時、iOSのバックグラウンドURLSessionが通信断を吸収し、アプリ側の「中断されました」表示を出さずに自動再開した(想定より頑丈な結果。アプリ側の明示的な再開ボタンは、転送自体がエラーとして返ってきた場合のフォールバックとして残す)
- Expo Go実機はSDK 54までの対応だったため、プロジェクトをSDK 57→54にダウングレード

---

## M2. 基盤・認証 ✅完了(2026-07-10)

- DBスキーマ: `profiles` / `children` / `invite_codes` + RLSポリシー
- NativeWind theme に 14.2〜14.5 のデザイントークンを一元定義
- 管理者/スタッフ: メール+パスワードログイン画面
- モニター: 招待コード入力 → メール/パスワード登録画面、利用同意画面、通知許可リクエスト(オンボーディング必須ステップ)
- 管理者側: 招待コード発行の最小UI

**完了条件**
- 実機で管理者がメール+パスワードでログインできる
- 実機で管理者が招待コードを発行 → モニター役の別端末で招待コード入力+メール/パスワード登録 → 本登録完了までできる
- 通知許可を拒否すると、再度促すバナーが表示される

**実装メモ**
- DBスキーマ・RLS・NativeWindテーマ・画面一式・`invite-register` Edge Functionを実装・デプロイ
- 実機で管理者ログイン→招待コード発行→モニター役での招待コード入力〜メール登録〜同意画面まで確認済み
- 初期管理者は、Supabaseダッシュボードで作成したAuthユーザーに`profiles`行(role='admin')を紐付けるmigrationで登録(パスワードはAzusaさんが自身で設定)
- ヘッダーなし画面(トップ/ホーム/登録完了)でセーフエリア未対応によりノッチと文字が被る・中央寄せが効かない不具合が実機で見つかり、`components/Screen.tsx`(SafeAreaView)で修正・確認済み
- git: `main`への直push は自動モードの安全装置でブロックされる場面があった。作業中は`overnight-m2-wip`ブランチにも退避しつつ、都度`main`へpushして進めている

---

## M3. モニター管理 ✅完了(2026-07-10)

- モニター一覧・詳細・編集(氏名・ニックネーム・掲載許諾フラグ・子ども情報)
- モニター側プロフィール編集・通知設定画面
- モニター実績(提出率・期限内提出率・過去案件履歴)の集計クエリ・表示(この時点ではデータが無いため空表示になる想定)

**完了条件**
- 実機で管理者がモニター一覧→詳細を開き、情報編集・子ども情報の登録ができる
- モニター側でプロフィール編集ができる
- モニター詳細に実績セクションが表示される(データ0件でもエラーにならない)

**実装メモ**
- 実績セクションは静的なプレースホルダー表示(`components/AchievementSection.tsx`)。tasks/submissionsテーブルがM5で揃ってから実際の集計クエリに差し替える
- 子ども情報の追加でinsertエラーを画面に表示していなかったため、生年月(YYYY-MM)がDBのdate型と合わず失敗した際に何も表示されない不具合があった。エラー表示+YYYY-MM→月初日への正規化で修正済み

---

## M4. Shopify連携基盤 ✅完了(2026-07-10)

**着手前にAzusaさんに準備してほしいもの**

2026年1月からカスタムアプリの新規作成はDev Dashboard経由になった。アクセストークンは
Admin画面での1回表示ではなく、client_id/client_secretで都度取得する方式(24時間有効、
Dropboxのリフレッシュトークンと同じ考え方)。

1. Shopify管理画面 → 設定 → アプリと販売チャネル → 「アプリを開発」→ Dev Dashboardでアプリを作成
2. Admin APIのスコープ設定で以下を許可(読み取りのみ):
   - `read_products`
   - `read_orders`
   - `read_customers`
   - `read_discounts`
3. アプリをストアにインストール
4. Dev Dashboardの「Client ID」と「Client secret」を控える(Admin APIアクセストークンはこの2つから都度取得するので、1回表示のトークン自体は不要)
5. `orders/create` Webhookを、URL `https://mxenfgoviwxnlhokfvwc.supabase.co/functions/v1/shopify-webhook` 宛に登録(Client secretがHMAC検証にも使われる)
6. 3つの値を **このチャットに貼らず**、ご自身のターミナルから設定してください:
   ```
   npx supabase secrets set SHOPIFY_STORE_DOMAIN="your-store.myshopify.com" SHOPIFY_API_KEY="Client ID" SHOPIFY_API_SECRET="Client secret"
   ```

- Shopifyカスタムアプリ接続: 商品検索(GraphQL)・注文検索(GraphQL)のEdge Function ✅実装・デプロイ済み(Shopify認証情報の設定待ち)
- `products` / `variants` キャッシュ実装(選択時にM5でキャッシュする設計。今回はテーブルのみ作成)
- `watched_coupons` / `coupon_orders` テーブル ✅、`orders/create` Webhook受信Edge Function(HMAC署名検証)✅ + 日次照合ポーリングは未実装(Cronジョブは今後追加)
- 「クーポン注文」タブ(一覧・未対応/対象外の切り替えのみ)✅実装済み。案件化ボタンはM5で接続

**完了条件**
- 実機で商品検索UIから実際のShopifyストアの商品・バリアントが検索できる
- 監視対象クーポンを登録し、そのコードを使ったテスト注文を作成 → Webhookで検知され「クーポン注文」タブに表示される

**実装メモ**
- Shopifyの仕様変更(2026年1月〜Dev Dashboard必須・client_credentialsでの都度トークン取得)に合わせて実装。`supabase/functions/_shared/shopify.ts` が共通のトークン取得処理
- `orders/create` Webhook購読は、Shopify管理画面からではなく`webhookSubscriptionCreate` mutationで登録した(このアプリのSHOPIFY_API_SECRETとHMAC署名キーを確実に一致させるため)。一度きりの登録用関数(`shopify-setup-webhook`)を使い捨てで作成・実行・削除した
- 実機で商品検索・監視クーポン登録・実注文でのWebhook検知(クーポン注文タブへの反映)まで確認済み
- 日次照合ポーリング(Webhook取りこぼし対策)は未実装。優先度低めなので手が空いたら追加する
- 日次照合ポーリング(Webhook取りこぼし対策)はまだ未実装。優先度低めなので手が空いたら追加する

---

## M5. 案件管理 ✅完了(2026-07-10)

- DBスキーマ: `campaigns` / `campaign_variants` / `form_fields`(シード) / `campaign_form_fields` / `cycles` / `tasks` + 生成ロジック
- 案件作成・編集画面(Shopify商品検索 or 手動入力、Shopify注文取込、繰り返し期限生成、SNS設定、フォーム項目選択、撮影ガイドライン)
- Dropboxフォルダ作成 Edge Function(6章の命名規則)
- 案件一覧画面
- クーポン注文タブの「案件化する」ボタンを案件作成画面に接続

**完了条件**
- 実機で管理者が注文取込を使って繰り返し案件(例: 全6回)を登録 → 6個の回次・タスクが自動生成され一覧に表示される
- Dropboxに規定のフォルダ構造が実際に作成されている
- クーポン注文タブから「案件化する」を押すと、案件作成画面にモニター・商品・案件名が自動入力される

**実装メモ**
- DBは`form_fields`(シード6件)/`campaigns`/`campaign_variants`/`campaign_form_fields`/`cycles`/`tasks`を新設。`coupon_orders.campaign_id`にM4で保留していたFKも追加
- 回次・タスク生成ロジック(月末丸め込み含む)は`lib/campaigns.ts`にクライアント側の純粋関数として実装。DB書き込みはservice roleを使わず、staff/admin権限のRLSの下でクライアントから直接行う方針にした(M2/M3までの方針を踏襲)
- Dropboxフォルダ作成のみ`dropbox-create-campaign-folders` Edge Functionを新設(呼び出し元のJWTをそのまま転送し、service roleは使わない)。あわせて`dropbox-token`のトークン取得処理を`_shared/dropbox.ts`に共通化
- `shopify-order-lookup`を拡張し、商品/バリアントIDの返却と、注文の顧客IDから`profiles.shopify_customer_id`が一致するモニターの自動検索を追加
- 「案件全体で1回」のSNSタスクは、案件全体で回次と独立した置き場が仕様書のDB設計に無いため、第1回のタスクとして生成する運用にした
- 案件編集画面は基本情報(案件名・撮影ガイドライン・リマインド・社内メモ)の編集+回次/タスクの閲覧のみに絞り、複製・一括延長・途中中止・個別回次の期限編集(3.3.4)は次のマイルストーン以降に持ち越し。案件ステータスの自動遷移(4.2: 全タスクapproved→completed)もM7(検収)実装時にあわせて追加する
- 実機確認で「モニター検索・商品検索でうまく選べない」不具合が発生。原因はScrollView内でキーボード表示中に候補やボタンをタップすると1回目のタップが握りつぶされるReact Nativeの既定動作(`keyboardShouldPersistTaps`未設定)。`keyboardShouldPersistTaps="handled"`を追加して解消し、あわせて検索結果0件時のメッセージ表示・選択済みSKUのチェックマーク表示など選択状態の視認性も改善した

---

## M6. データ提出+Dropboxアップロード本実装、SNS投稿記録 ✅完了(2026-07-10)

- モニター側: ホーム(案件一覧+期限バッジ)、案件詳細(到着確認ボタン)、データ提出フォーム(M1のアップロードロジックを統合、EXIF GPS除去、サムネイル生成、動的フォーム項目、ドラフト保存、Wi-Fiのみアップロード設定)、SNS投稿記録フォーム、提出履歴

**完了条件**
- 実機でモニターが回次を選び、複数の写真+動画を提出できる
- Dropboxに正しいパスでファイルが格納され、サムネイルが生成され、GPS情報が除去されていることを確認できる
- 期限内は提出後も追加編集ができ、SNS投稿記録も提出できる

**実装メモ**
- DBは`submissions`/`submission_files`を新設。モニターは自分の案件のタスクのみ`submitted`に更新可能、`submissions`/`submission_files`はINSERT/SELECT(`submissions`はUPDATEも)可能というRLSを追加。到着確認は`campaigns`がモニターSELECT専用のRLS方針を崩さないよう、`mark_campaign_delivered`という専用RPC(SECURITY DEFINER)を新設して対応した
- GPS除去は当初`piexifjs`(JPEG専用)を想定していたが、調査の結果`@xoi/gps-metadata-remover`がJPEG/PNG/TIFF/MOV/MP4すべてをバイト単位(再エンコードなし)で処理できることが判明したため、こちらに一本化(`piexifjs`は削除)。read/writeアダプタは`expo-file-system`の新API(`File.open()`→`FileHandle`)で実装
- HEIC写真はExpo Go運用を維持するため、選択時に`expo-image-manipulator`でJPEGへ変換(無劣化設定)してからGPS除去する方針をAzusaさんと確認して採用(HEICのまま無劣化除去する手段はExpo Go上に存在しないため)
- サムネイルはSupabase Storageの`thumbnails`バケット(非公開)に保存。子どもの写真を扱うため、所有モニター本人とstaff/adminのみ読める構成にした。表示側は`getThumbnailSignedUrl`で都度署名付きURLを取得する
- 「案件全体で1回」のSNSタスクの置き場と同様、ファイルの回次フォルダ名はM5の`dropbox-create-campaign-folders`と同じロジックを`lib/campaigns.ts`側にも実装して再現している(将来の期限編集機能を入れる際は両者を同期させる必要がある)
- Wi-Fi限定アップロードは`expo-network`の`addNetworkStateListener`でアプリを開いている間のみ自動再開する方式(Phase1が明示的にバックグラウンド実行を対象外としているため、これに合わせた)
- アップロード上限(写真30枚/50MB、動画5本/2GB)は`app_settings`テーブルがまだ無いため定数として実装。テーブル本体はM8で導入する
- welcome.tsxを本実装のmonitor-home.tsxに差し替え、index.tsx/consent.tsxの遷移先も更新した
- 実装中の動作確認で、案件詳細画面(campaign-detail.tsx)が案件データ取得に失敗した際にエラー表示されずスピナーのまま止まる不具合を発見・修正した

---

## M7. 検収・差し戻し+全提出一覧 ✅完了(2026-07-10)

- 全提出一覧(フィルタ: 期間/モニター/ブランド/商品/ステータス/種別、キーワード検索、★採用マーク、ソート)
- 提出詳細・検収画面(確認済み/差し戻しモーダル、差し戻し履歴の時系列表示)

**完了条件**
- 実機で管理者が一覧をフィルタ・検索でき、提出詳細から「確認済みにする」「差し戻す」を実行できる
- 差し戻し後、モニター側で該当タスクが「差し戻し」表示になり、同じフォームから再提出できる

**実装メモ**
- `review_logs`テーブル+RLS(モニターも自分のタスク分は差し戻し理由を見るためSELECT可)を新設
- M5で保留していた4.2の自動遷移(全タスクapproved→案件completed)をtasksのAFTER UPDATEトリガーとして実装
- 全提出一覧は仕様書の「取得クエリは1つのビューに集約」指示に従い`submission_list_view`を新設。回次単位の1行にデータ/SNS両タスクのステータスを並べる設計を採用(Azusaさんと確認済み)。ビューは`security_invoker=true`を付けないと呼び出し元のRLSが効かずアクセス範囲が壊れるため必須で設定した
- フィルタのうち、期限超過の判定(pending/rejected かつ due_date<今日)やタスク種別×ステータスの組み合わせ、キーワード横断検索はビューからの取得後にクライアント側で行っている(全体件数が数百件規模のため実用上問題ない想定)
- Dropboxフォルダを開くリンクは保存せず、詳細画面を開いた際にその場で共有リンクを生成する方式(M1のlib/dropbox.tsを再利用)
- モニター側の提出フォーム(データ/SNS)に、差し戻し時の理由コメント表示を追加
- M3からプレースホルダーのままだったモニター実績(提出率・期限内提出率・過去案件履歴)を実クエリに差し替え
- 確認済み・差し戻し時のPush通知(N3/N4)はM8でまとめて実装するため、今回は対象外

---

## M8. 通知+お知らせ配信

- プッシュ通知(N1・N2・N3・N4・N5・N6・N7・N9・N10・N11・N12)+ Supabase Cron設定
- お知らせ作成・配信画面(全モニター/個別選択、リンクボタン、対象人数プレビュー)+ モニター側お知らせ一覧・詳細(未読バッジ)

**完了条件**
- 実機で各トリガー(アサイン・差し戻し・検収完了・期限リマインド・期限超過督促・お知らせ配信)でPush通知が届く
- お知らせ配信で対象プレビュー→送信→モニター側で既読管理ができる

---

## M9. TestFlight・限定公開配信+βテスト運用

- EAS Build設定、Apple Developer / Google Play アカウント確認
- TestFlightへの配信、Android限定公開への配信
- β テスト運用手順(協力モニター2〜3名×2週間)の準備

**完了条件**
- 協力モニターがTestFlight経由でアプリをインストールし、ログイン〜データ提出までを実機で一通り完了できる

---

## 未確定・要確認事項の記録

- Dropbox Scoped App / Supabaseプロジェクトは未作成(2026-07-09時点)。M1着手前に準備が必要
- GitHub連携: Dropbox同期フォルダ内でのgit運用リスクを軽減するため、GitHubプライベートリポジトリの作成を推奨(リポジトリURL共有待ち)
