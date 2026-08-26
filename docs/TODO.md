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

## M8. 通知+お知らせ配信 ✅実装済み(2026-08-25)・実機確認待ち

- プッシュ通知(N1・N2・N3・N4・N5・N6・N7・N9・N10・N11・N12)+ Supabase Cron設定
- お知らせ作成・配信画面(全モニター/個別選択、リンクボタン、対象人数プレビュー)+ モニター側お知らせ一覧・詳細(未読バッジ)

**完了条件**
- 実機で各トリガー(アサイン・差し戻し・検収完了・期限リマインド・期限超過督促・お知らせ配信)でPush通知が届く
- お知らせ配信で対象プレビュー→送信→モニター側で既読管理ができる

**実装メモ**
- DBは`notification_templates`(N1〜N7,N9〜N12のテンプレをシード。N9はannouncements自体のtitle/bodyを都度使うためプレースホルダー行のみ)/`notification_logs`/`app_settings`(admin onlyのRLS。リマインド日程[7,1]・超過督促+2日・到着確認5日等をシード)/`announcements`/`announcement_targets`を新設
- 即時通知(N1案件アサイン・N3差し戻し・N4確認済み・N5モニター提出・N9お知らせ配信)は`notify-dispatch` Edge Functionを新設し、該当する各画面(案件作成・検収・データ/SNS提出・お知らせ配信)から操作成功後に呼び出す方式にした。呼び出し元のJWTで「本人か・権限があるか」を確認したうえで、push_token取得・送信・ログ記録のみservice roleで行う(N5はモニターがstaff/adminのpush_tokenを読む必要があり、モニターのRLSでは読めないため)
- 日次通知(N2期限7日前/前日・N6期限超過督促・N7期限超過報告・N10到着確認リマインド)は`notify-cron`、外部連携異常検知(N12: Dropboxトークン失効/Shopify APIエラー/Dropbox容量80%超過)は`notify-health-check`をそれぞれ新設。pg_cron+pg_net(Supabase公式のEdge Function定期実行パターン)で毎朝9:00 JST(=00:00 UTC)に起動する設定をmigrationに含めた
- Cron用Edge Functionはservice roleではなく`CRON_SECRET`という共有シークレット(ヘッダー`x-cron-secret`)で認証する。値そのものをmigrationやチャットに含めないため、**適用後に一度だけ、ご自身のターミナル/SQL Editorから以下を実行してください**:
  ```sql
  select vault.create_secret('<任意のランダム文字列>', 'cron_secret');
  ```
  ```
  npx supabase secrets set CRON_SECRET="<vaultに保存したのと同じ値>"
  ```
- N11(クーポン注文検知)は`shopify-webhook`に直接追加(既存のservice role実装のまま)。Webhookの再送で同じ注文が再度届いても、初回検知時のみ通知するようにした
- push_token取得(`lib/push.ts`)は`expo-notifications`の`getExpoPushTokenAsync({projectId})`を使うが、**EASのprojectIdが未設定の間は静かにスキップする**実装にしている。実際にPushが届くようになるのはM9でEASプロジェクトを作成(`eas init`など)した後。それまでは通知許可は取得・保存されるが、push_tokenは空のままになる
- 管理者/スタッフはこれまで通知許可を求めていなかった(N5/N7/N11/N12の宛先になるため今回追加)。ログイン成功時に許可リクエスト+トークン登録を行うが、モニターと異なりブロッキングにはしていない(仕様書3.8はモニターの必須オンボーディングのみを求めている)
- お知らせは「作成=即配信」で下書き状態を持たない(3.9の要求どおり、作成画面内でプレビュー→送信の2ステップにした)
- `docs/TODO.md`未確定事項として残す: 実機でのPush到達確認はEASプロジェクト作成後(M9着手時)にまとめて行う想定

---

## M9. TestFlight・限定公開配信+βテスト運用 🚧準備中(2026-08-25)

- EAS Build設定、Apple Developer / Google Play アカウント確認
- TestFlightへの配信、Android限定公開への配信
- β テスト運用手順(協力モニター2〜3名×2週間)の準備

**完了条件**
- 協力モニターがTestFlight経由でアプリをインストールし、ログイン〜データ提出までを実機で一通り完了できる

**準備状況(2026-08-25時点)**
- Apple Developer Program / Google Play Console: Azusaさん側で登録済み
- bundle identifier / package name は `com.anoko.monitor`(iOS/Android共通)に決定。`app.json`に設定済み
- `app.json`: `expo-image-picker`(写真ライブラリ利用許諾文言)・`expo-notifications`(通知アイコン色)のconfig pluginを追加、iOSの`ITSAppUsesNonExemptEncryption: false`も設定済み(暗号化に関する審査質問を回避)
- `eas.json`を新設(development/preview/production の3プロファイル。productionは`autoIncrement: true`でビルド番号を自動採番)
- **EASプロジェクト自体は未作成**(`eas login`/`eas init`/`eas build:configure`は今回のセッションでは未実施)。このセッション(GitHub連携のリモート実行環境)にはAzusaさんのExpoアカウントでのログイン手段が無いため、以下は**Azusaさんご自身のPC(ローカルのクローン、またはこのプロジェクト本来のDropbox同期フォルダ)のターミナルから実行**してください:
  ```
  npx eas login
  npx eas init          # 初回のみ。projectIdが払い出され app.json の extra.eas.projectId に自動追記される
  npx eas build:configure
  npx eas build --platform ios --profile production
  npx eas build --platform android --profile production
  ```
  ビルド完了後、配信は:
  ```
  npx eas submit --platform ios --profile production      # App Store Connect → TestFlight
  npx eas submit --platform android --profile production  # Google Play Console(アップロード後、Play Console側で内部テスト/非公開テストのトラックに手動で割り当て)
  ```
  Android提出時にPlay Consoleのサービスアカウントキー(json)を聞かれた場合は、Google Play Console側でAPIアクセス用のサービスアカウントを作成し、ローカルのファイルパスを指定してください(このやり取りもチャットには値を貼らないこと)。
- **`extra.eas.projectId`が設定されるまで、M8で実装したPush通知のトークン取得(`lib/push.ts`)は静かにスキップされ続ける**。`eas init`実行後にコードの変更は不要(Expoが`app.json`を自動更新するため)だが、実機でのPush到達確認は`eas init`実施後に行うこと
- 併せて、M8実装メモに記載した`CRON_SECRET`のvault登録(`select vault.create_secret(...)`+`npx supabase secrets set CRON_SECRET=...`)もまだ未実施。日次通知(N2/N6/N7/N10)・異常検知(N12)を実機で確認する前に済ませておくこと
- 上記の`eas init`実行後、次のセッションでは`app.json`の差分(`extra.eas.projectId`)を取り込んでから、ビルド後の実機確認・TestFlight配信・Google Play限定公開・βテスト運用手順の作成に進む

**実機検証で見つかった不具合と直し方(2026-08-25)**
- 初回`eas build`が「Install dependencies」フェーズで失敗。原因は`package-lock.json`が`package.json`と非同期(`npm ci`が使えない状態)だったこと。さらに`buffer`(`@xoi/gps-metadata-remover`→`crc`が6.0.3、`expo`→`whatwg-url-without-unicode`が5.7.1を要求)と`yaml`(`@expo/ngrok`が1.10.3、`expo`/`react-native`/`tailwindcss`側が2.9.0を要求)がそれぞれ2つの互換性のないバージョンを要求する依存関係になっており、`npm install`を実行するたびに解決結果が不安定に変わっていた。`package.json`に`overrides`(`buffer: 6.0.3` / `yaml: 2.9.0`)を追加して単一バージョンに固定し、`npm install`→`package-lock.json`更新で解消(`npm ci`を3回連続実行して安定することを確認済み)
- ビルド自体は成功しTestFlightにインストールできたが、起動直後にクラッシュ。原因は`.env`が`.gitignore`対象でEASにアップロードされず、`EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`が未設定のまま`lib/supabase.ts`が起動時にthrowしていたこと。[expo.dev](https://expo.dev/accounts/anokobaby/projects/anoko-monitor) → Environment variables で、Production環境(Plain text)にこの2つを登録し、再ビルドすることで解消する想定(**再ビルド後の実機確認はまだ**)

---

## Web版(モニター提出・管理者機能の緊急対応) 🚧Vercelデプロイ済み・実機確認中(2026-08-25)

TestFlight配信の本稼働までまだ時間がかかるため、モニターに至急データ提出をお願いできるよう、既存のExpo Router(react-native-web)アプリをそのままWebでも動かす対応を優先実施。ネイティブ専用API依存を洗い出し、Web版では別実装に差し替えた。Vercelへの無料URLでのホスティングを想定(範囲: モニター側+管理者側の両方。仕様書には元々Web版の記載はなく、今回の緊急対応として追加)。

**対応した箇所**
- `lib/dropbox.ts`: チャンクアップロードをWeb版は`fetch`+`Blob.slice()`で直接送信するよう分岐(expo-file-systemはWeb未対応のため一時ファイル書き出し方式が使えない。むしろネイティブ側で問題になった「fetchがBlobボディ非対応」という制約はブラウザには無いため、実装はシンプルになった)
- `lib/mediaPipeline.ts`:
  - GPS除去(`stripGpsMetadata`): Web版はblob:URLの中身をメモリ上のUint8Arrayとして読み書きし、処理後に新しいBlob/blob:URLを返す方式に変更(expo-file-systemの新File/FileHandle APIがWeb未対応のため)。戻り値のURIを以後の処理で使うよう`processAndUploadFile`側も修正
  - 動画サムネイル(`generateVideoThumbnail`): expo-video-thumbnailsはWeb実装が「throw」するだけで実質未対応のため、`<video>`+`<canvas>`で自前にフレームを取得する処理を追加
  - 写真サムネイル・HEIC→JPEG変換: expo-image-manipulatorは実はWeb版でもcanvasベースの実装が存在するため無改修で動作。ただしHEICは大半のブラウザ(Safari以外)がデコードできないため、失敗時はWeb版のみ元ファイルのまま続行・サムネイルなしで処理を続ける(`ProcessedFileResult.thumbnailPath`をnull許容に変更)
  - サムネイルのSupabase Storageアップロード: Web版は`fetch(uri).blob()`で取得したBlobをそのまま渡す方式に変更(expo-file-systemのFile APIが使えないため)
- Push通知関連(`lib/push.ts`, `app/consent.tsx`, `app/admin-login.tsx`, `app/monitor-profile.tsx`): Web Push(service worker/VAPID)は未整備のため、Web版では許可リクエスト自体を行わずスキップ。モニター側のオンボーディング(3.8の必須ステップ)もWeb版は通知許可なしでそのまま進める
- Wi-Fi限定アップロード: ブラウザはWi-Fi/モバイル回線を区別できないため、Web版は常にOFF扱い(設定项目もプロフィール画面から非表示)
- `vercel.json`新設: SPA(`expo export -p web`のデフォルト出力)のため、全パスを`index.html`にrewriteする設定が必須(無いと`/admin-login`等への直接アクセス・リロードが404になる)。`"web": {"output": "static"}`も試したが、SSR時に`window`未定義でAsyncStorage/Supabaseクライアントの初期化がクラッシュしたため見送り、デフォルトのSPA出力のままとした
- サンドボックス内で`npx expo export -p web`のビルド成功、Playwrightでの起動確認(トップ画面・招待コード入力・管理者ログイン画面への遷移)・TypeScriptチェックまでは確認済み

**未確認・残タスク**
- 実際のSupabaseプロジェクトに対する動作確認(ログイン〜データ提出〜Dropboxアップロードまでの一連の流れ)は未実施。Azusaさんの環境で確認が必要
- Vercelへの実デプロイ未実施。Azusaさんのターミナルから以下の対応が必要:
  1. https://vercel.com にGitHubアカウントでログイン → 「Add New...」→「Project」→ このリポジトリ(`anoko-baby/monitor-app`)をImport
  2. Root Directoryはリポジトリのルートのまま、Framework Presetは自動検出されなければ「Other」を選択(`vercel.json`にビルドコマンド・出力先を設定済みなので通常はそのままで動くはず)
  3. 「Environment Variables」に`EXPO_PUBLIC_SUPABASE_URL`・`EXPO_PUBLIC_SUPABASE_ANON_KEY`を登録(Supabaseダッシュボード → Settings → API から取得。M9のEAS環境変数と同じ値)
  4. Deployを実行 → 発行されたURL(`https://xxxxx.vercel.app`)をモニターに共有
- 大容量動画(仕様書上限2GB)をWeb版でGPS除去する際、ブラウザのメモリに一度全体を読み込む実装になっている。デスクトップブラウザでは通常問題ないが、モバイルブラウザ(特にメモリの少ない端末)では大きい動画で失敗する可能性がある。実機確認で問題が出た場合は分割処理等の追加対応を検討
- Web版はページの再読み込み(リロード)を挟むとアップロードの再開(resume)ができない(blob: URLがページと共に無効になるため)。ネイティブ版のような「機内モードから復帰しても続きから再開」は期待できない制約として認識しておくこと

**Vercelデプロイでハマった点(2026-08-25)**
- Vercelのプロジェクト設定で「Production Branch」がデフォルトの`main`になっていたため、`claude/dev-progress-check-mjwn15`ブランチの内容(`vercel.json`含む)が反映されず、ビルド自体が走らずNOT_FOUNDになった。`claude/dev-progress-check-mjwn15`を`main`にPRマージして解消
- Vercelの環境変数は`EXPO_PUBLIC_`のようなpublicなframework prefixを持つキーに対して`Sensitive`(secret)指定ができない仕様。「Sensitive」チェックを外して(Plain扱いで)登録する必要がある

**実機/実データ確認で見つかった不具合の修正(2026-08-25、Web版公開後にAzusaさんが実際に触って発見)**
- 🔴 **セキュリティ**: `admin-login.tsx`が`signInWithPassword`成功後にロールを確認しておらず、モニターのメール/パスワードでも管理画面(`/admin-home`)に入れてしまっていた。ログイン成功後に`profiles.role`を確認し、admin/staffでなければ`signOut`してエラー表示するよう修正
- モニター向けの再ログイン画面が存在しなかった(初回登録後、セッションが切れた場合に戻る手段が無かった)。`app/monitor-login.tsx`を新設し、トップ画面にリンクを追加
- 案件登録時の案件名サジェスト「(モニター名様)」にモニター名が反映されないことがあった不具合。Shopify注文取込・クーポン案件化などルートによって発生タイミングがバラバラだったため、`selectedMonitor`/`selectedProducts`の変更を監視する`useEffect`に一本化し、常に選択中のモニター名を反映するよう修正(管理者が手動で件名を編集した後は上書きしない)
- 招待・登録フローの項目を変更(仕様変更): 招待時は氏名・ニックネームではなく**Instagramアカウント名**のみで仮登録するように変更。本登録(招待コード入力)時にモニター本人が**氏名・都道府県・電話番号・メールアドレス**を入力する形に変更。`profiles.name`をnullable化し`instagram_handle`/`prefecture`/`phone`列を追加(migration `20260825000002`)。`invite-register` Edge Functionと`admin-invite-issue.tsx`/`register.tsx`/モニター一覧・詳細/案件作成画面のモニター検索(名前 or Instagramアカウント名で検索)を対応する形に修正
- Web表示時、スマホ幅前提のレイアウトがワイドな画面で間延びして見づらい問題を修正。`app/_layout.tsx`のルートで最大幅480pxの中央寄せカラム+外側をline色でレターボックス表示するようにした(ネイティブは影響なし)
- 管理者・モニター双方にフッター固定タブメニューを新設(`components/BottomTabBar.tsx`)。モニター側は「ホーム/提出履歴/お知らせ/プロフィール」、管理者側は「ホーム/案件一覧/全提出一覧/モニター一覧/お知らせ配信」の4〜5項目。詳細・フォーム系の画面は従来どおりネイティブヘッダー+戻るボタンのプッシュ遷移のまま(WEAR等の一般的なアプリ構成に合わせ、タブバーは主要画面のみに設置)
- **アイコン・配色などの本格的な見た目の作り込みはまだ未着手**。Azusaさんから参考画像(WEARアプリのスクリーンショット等)を受け取り次第、次のセッションで着手する

**WEAR風UI改善(2026-08-25、参考スクショ受領後に着手)**
- 配色はanoko.ブランドのトークン(クリーム×セージグリーン、spec 14.2)を維持しつつ、WEARのUIパターン(アイコンナビ・リスト行・バッジ)を取り入れる方針で実施(完全なモノクロ化はしていない。ブランドトーンと合わないため)
- `@expo/vector-icons`(Ioniconsアウトライン/塗りつぶし)を正式な依存関係として追加(`npx expo install`で追加。以前はexpo経由の間接依存のみでimportできなかった)
- `components/BottomTabBar.tsx`をアイコン+ラベル方式に変更(非選択時はアウトラインアイコン+ink-soft、選択時は塗りつぶしアイコン+ink・太字)
- `components/Avatar.tsx`(頭文字の丸アイコン)・`components/StatusPill.tsx`(丸みのある小さなステータスバッジ)を新設
- モニター一覧・お知らせ一覧(管理者/モニター両方)を、個別カード(角丸+枠線)方式からWEARのブランド一覧のような「アバター+テキスト+区切り線」の一覧形式に変更。案件一覧はステータス表示のみPillに置き換え(回次ドット等の情報量が多いためカード形式は維持)
- サンドボックス内で`npx expo export -p web`のビルド成功・アイコンフォント(Ionicons.ttf)がビルド成果物に含まれることを確認。ログイン必須画面(タブバー含む)は認証情報が無いため実際の見た目はAzusaさんの環境での確認待ち
- 未対応: 案件一覧・全提出一覧など情報量の多い画面のカードデザインの作り込み、フォームのトグルボタンをWEARのようなpill形状にする調整(既存のborder-controlトークンを変更すると影響範囲が広いため、今回は見送り)

---

## 導線・データ連携の総点検(2026-08-25、「不完全な個所が多すぎる」フィードバックへの対応)

**タブバー・戻る導線の修正**
- フッタータブメニューが「各メニューを選択すると消える」問題を修正。管理者/モニター双方の一覧系画面(`admin-campaign-list`/`admin-submission-list`/`admin-monitor-list`/`admin-announcement-list`、モニター側`submission-history`/`announcements`/`monitor-profile`)を`Screen`+`BottomTabBar`構成に統一し、`app/_layout.tsx`側もこれらの画面を`headerShown: false`に変更(ネイティブヘッダーとタブバーが二重表示されていた問題も解消)
- 詳細・フォーム系の全画面(`campaign-detail`/`submission-form`/`sns-submission-form`/`announcement-detail`/`admin-monitor-detail`/`admin-campaign-form`/`admin-submission-detail`/`admin-announcement-form`/`admin-invite-issue`/`admin-product-search`/`admin-watched-coupons`/`admin-coupon-orders`)に、確実に戻れる戻るボタンを追加。`components/HeaderBackButton.tsx`の`makeHeaderBackButton(fallbackHref)`を使い、`router.canGoBack()`が真なら通常の戻る、偽なら(Web版でリロードした場合など履歴が無いケース)決まった親画面へ`replace`する方式に統一。各画面の戻り先は実際の遷移元(例: `admin-invite-issue`→`admin-monitor-list`、`admin-campaign-form`→`admin-campaign-list`)に合わせて設定した

**データ接続不具合(モニター一覧が空/紐づけた案件が見えない)の調査結果**
- コード側(クエリ・RLSポリシー)を再確認したが、`admin-monitor-list.tsx`・`monitor-home.tsx`のクエリ、および`current_profile_id()`/`campaigns`のRLSポリシー(`monitor_id = current_profile_id()`)自体にはロジック上の不具合は見つからなかった。`invite-register`もモニター本登録時に新しいprofile行を作らず、招待時に作成済みのprofile行を`update`する実装になっており、招待→本登録でモニターのprofile.idがズレる作りにもなっていない
- 最有力の原因は**migration `20260825000002`(`instagram_handle`/`prefecture`/`phone`列追加)が未適用**であること。このmigrationを当てないまま`admin-monitor-list.tsx`が`instagram_handle`列を含むクエリを実行するとエラーになり、旧コードでは`data ?? []`でエラーを握りつぶして「0件」に見えていた(この握りつぶしパターン自体は今回の一覧系画面すべてで`error`を捕捉し`ErrorBanner`に表示するよう修正済みなので、次回以降は実際に何が失敗しているかエラーメッセージが画面に出るようになった)
- 案件が紐づいたはずなのにモニター側に表示されない件は、コード上の不具合を特定できなかったため、Azusaさんの実データを直接見て原因切り分けが必要。下記の診断SQLをSupabaseのSQL Editorで実行し、結果を貼っていただければ次のセッションで特定する
  ```sql
  -- 1. migration 20260825000002 が当たっているか(instagram_handle列の存在確認)
  select column_name from information_schema.columns
  where table_name = 'profiles' and column_name in ('instagram_handle', 'prefecture', 'phone');

  -- 2. モニター一覧(admin-monitor-listと同じ条件)
  select id, name, nickname, instagram_handle, status, auth_user_id, created_at
  from profiles where role = 'monitor' order by created_at desc;

  -- 3. 対象の案件がどのmonitor_idに紐づいているか
  select id, campaign_no, title, monitor_id, status, deleted_at
  from campaigns order by created_at desc limit 20;

  -- 4. そのモニターがログインした際に current_profile_id() が返すはずのid
  --   (対象モニターのメールアドレスに置き換えて実行)
  select p.id as profile_id, p.name, p.instagram_handle, p.auth_user_id, u.email
  from profiles p join auth.users u on u.id = p.auth_user_id
  where u.email = 'ここにモニターのログイン用メールアドレスを入れる';

  -- 5. 上記3のmonitor_idと4のprofile_idが一致しているかを目視確認。
  --    一致していない場合、案件作成時に別のprofile行(同名の重複招待など)を選んでしまっている可能性が高い
  ```
- あわせて、招待時のInstagramアカウント名や氏名が重複している場合、同一人物のprofile行が複数できてしまっていないかも上記2の結果で確認してください(重複があれば案件の紐付け先を統一する必要があります)

**Dropbox連携の再点検で見つかった不具合の修正**
- `supabase/functions/dropbox-create-campaign-folders/index.ts`が案件作成時にDropboxフォルダ名(`{案件番号}_{モニター名}`)を組み立てる際、`profiles.name`のみを参照していた。今回の招待フロー変更(招待時は`name`がnullでInstagramアカウント名のみ)によって、**本登録前のモニターの案件はすべて「モニター名未設定」というフォルダ名で作成されてしまう状態**になっていた。`name`が無ければ`instagram_handle`にフォールバックするよう修正(`supabase/functions/_shared/profiles.ts`の`monitorDisplayName`を新設し、同じロジックをアプリ側`lib/campaigns.ts`とも共有)
- 同じ理由で、日次通知バッチ(`notify-cron`)・即時通知(`notify-dispatch`)がstaff/admin向け通知文言に組み込む`monitor_name`も同様に空文字になり得ていたため、あわせて修正
- 上記以外(トークン更新・チャンクアップロード・共有リンク作成のロジック自体)には不具合は見つからなかった。**「連携できていない気がする」の具体的な症状(アップロードが失敗する/フォルダが作られない/リンクが開けない等)を教えていただければ、次のセッションでより的を絞った調査ができる**。特にDropbox側の`DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`/`DROPBOX_REFRESH_TOKEN`がSupabase Edge Function Secretsに正しく設定されているかは、このセッションからは確認できないため、`npx supabase functions deploy dropbox-create-campaign-folders dropbox-token`を再実行しつつAzusaさんの環境で実際に案件を1件作成してみて、Dropbox側にフォルダができるか確認をお願いしたい

**このセッションでの残タスク(Azusaさんの環境で実施が必要)**
1. `npx supabase db push`(migration `20260825000002`の適用。まだの場合、モニター一覧のクエリがエラーになり続ける)
2. `npx supabase functions deploy invite-register dropbox-create-campaign-folders notify-cron notify-dispatch dropbox-token`(このセッションでの修正を反映。`dropbox-token`は下記の不具合修正のため追加)
3. 上記の診断SQLをSQL Editorで実行し、結果を共有(「案件にモニターを紐づけたのに見えない」の原因特定用)
4. 案件を1件試験作成し、Dropboxに正しくフォルダ(`instagram_handle`名義含む)が作られるか確認

**実機フィードバック(2026-08-25、マージ後の実機確認で発見)**
- migration適用+マージ後、案件一覧はモニター側で正しく表示されることを確認(データ接続不具合は解消)
- 画像アップロード時に全ファイルで「Dropboxトークンの取得に失敗しました: Failed to send a request to the Edge Function」エラー。原因は`supabase/functions/dropbox-token/index.ts`が他のクライアント呼び出し系Edge Function(`dropbox-create-campaign-folders`/`invite-register`/`shopify-*`)と違い、CORSヘッダーの付与と`OPTIONS`メソッドへの対応が一切無かったこと。ネイティブ版のfetchはCORS制約を受けないため気づかれなかったが、Web版(ブラウザ)からの呼び出しはPOST前に必ずプリフライト(OPTIONS)が飛び、それが弾かれてブラウザ側で接続自体が失敗する(=「Failed to send a request」)という挙動だった。他の全クライアント呼び出し系Edge Functionと同じCORS対応を追加して修正。**要再デプロイ**(上記2に追加済み)
- ログイン前トップ画面(`app/index.tsx`)がWeb版で左右paddingが効いておらず、見出しやボタンが画面端まで全幅表示になっていた不具合を修正。原因は`components/Screen.tsx`(`SafeAreaView`)自体に`px-6`等のclassNameを直接渡しても、Web版ではsafe-area-context側が挿入するインラインpaddingに負けてpadding-left/rightが0pxになってしまうこと(react-native-safe-area-contextのWeb実装起因の既知の癖)。他の画面は元々「`Screen`の直下に`<View className="flex-1 px-6 ...">`を置く」パターンで書かれていたため影響を受けていなかったが、`index.tsx`だけ`Screen`に直接paddingを渡していたため発生していた。`index.tsx`を同じパターンに修正し、`Screen`コンポーネント自体も`className`/`style`propを受け付けない作りに変更(同種の不具合の再発防止。コメントで注意書きを追加)

## 提出フォームの複数子ども対応・カレンダー入力(2026-08-25)

実機フィードバックを受けて、日付入力のカレンダー化と、1件の提出に対して複数の子どもを紐づけられるようにする対応を実施。方針(1人の子どもに追加項目は個別入力/1人に複数バリエーションもあり得る)はAskUserQuestionでAzusaさんに確認済み。

**データ構造の変更**
- 新migration `20260825000003_submission_children.sql`: `submission_children`(提出×子ども。子どもごとの`age_months`・`form_data`)、`submission_child_variants`(子ども×バリエーションの多対多。1人が複数色/サイズを着用したケースに対応)を追加。RLSは既存の`submissions`/`submission_files`と同じ「タスクがapproved/cancelledでなければモニター本人が読み書きできる」パターンに揃えた。**要`npx supabase db push`**
- `lib/database.types.ts`に上記2テーブルの型定義を追加(手動管理のため)
- 案件ごとに設定する追加項目(身長・体重・足の実寸・フィット感・ひとことメモ)は、これまで提出1件につき共通で1つだった(`submissions.form_data`)のを、子どもごとに別々の値(`submission_children.form_data`)を持つ形に変更。撮影日(`shot_date`)のみ提出全体で共通のため`submissions.form_data`に残した
- 月齢/年齢(`age_months`)は、これまで案件ごとに任意で設定する項目の1つだった(手入力もできる建て付け)のを廃止し、`submission_children.age_months`として撮影日×子どもの生年月から**常に自動計算・自動保存**する形に変更(手入力欄は表示しない)

**カレンダー入力**
- `components/CalendarPicker.tsx`を新設。ネイティブモジュールに依存せず(EAS再ビルド不要)、Modal+自前グリッドで年月日/年月選択を実装。`mode="date"`(撮影日など、日まで選択・カレンダーグリッド)と`mode="month"`(子どもの生年月、年+月グリッドのみ)の2種類
- `app/submission-form.tsx`の撮影日、`components/ChildrenManager.tsx`の生年月をこのカレンダーに置き換え(YYYY-MM-DD/YYYY-MMの手入力を廃止)。撮影日は未来日を選べないようmaxDateを設定
- `lib/campaigns.ts`に`computeAgeLabel`(生年月+基準日→月齢+「n歳nヶ月」ラベル)・`formatAgeMonths`(月齢の整数値→ラベル)・`todayDateString`を追加(子ども一覧の現在年齢表示、提出フォームの撮影時点年齢表示、管理画面の詳細表示で共有)

**提出フォーム(`app/submission-form.tsx`)の変更**
- 「対象の子ども(複数選択可)」チップを追加。モニター本人が登録済みの全children(案件のchild_idに限定しない)から複数選択できる。案件にchild_idが設定されていて、かつまだ提出データが無い場合はその子をデフォルト選択しておく
- 選択した子どもごとにカードを表示: 撮影時点の年齢(自動計算・自動表示)/着用したカラー・サイズ(案件に登録済みのバリエーションから複数選択可)/身長・体重等の追加項目(子どもごとに個別入力)
- 送信時、`submission_children`・`submission_child_variants`を子ども単位でupsert・差し替え(選択解除された子どもの行は削除)。バリデーションも子どもごとに必須項目をチェックする形に変更
- 差し戻し再提出・下書き復元(ページリロード時の自動保存)にも対応(`lib/submissionDraft.ts`に`selectedChildIds`/`childFieldValues`/`childVariantIds`を追加)

**管理画面(`app/admin-submission-detail.tsx`)の変更**
- 「フォーム回答」を廃止し、「子どもごとの提出内容」として子どもの名前・撮影時点の年齢・着用バリエーション・追加項目の値をカードごとに表示するよう変更

**未確認・残タスク**
- 実際のSupabase環境でのmigration適用(`npx supabase db push`)と、モニター側での動作確認(子ども選択→カラー/サイズ選択→身長体重入力→提出→管理画面で正しく表示されるか)はまだ未実施
- カレンダーUI(`CalendarPicker`)はサンドボックス内でのビルド確認のみで、実機での操作感(タップ範囲・レスポンスなど)は未確認

## Dropboxアップロード「Load failed」の修正、プロフィール/ホームのWEAR風ヒアデザイン(2026-08-25)

**Dropboxアップロード不具合(実機で継続していた「Load failed」/「Failed to send a request」)**
- CORS修正後も画像アップロードが失敗し続けていた件を再調査。原因は`lib/mediaPipeline.ts`のGPS除去処理(`stripGpsMetadata`)がWeb版で処理後に新しい`blob:` URLを作成し、それを`lib/dropbox.ts`の`uploadFileToDropboxChunked`が改めて`fetch()`し直していたこと。Safari(WebKit)は`blob:` URLを作成から時間が経つ・他の非同期処理を挟むと`fetch()`が「Load failed」で失敗させることがある既知の挙動があり、これに該当していた
- 修正: `stripGpsMetadata`が処理済みの`Blob`オブジェクト自体も呼び出し元に返すようにし、`uploadFileToDropboxChunked`はそのBlobを直接受け取れるオプション引数(`webBlob`)を追加。これにより同じblob URLを二度fetchし直す必要が無くなった。あわせて、他に残っているblob URLのfetch箇所(サムネイルアップロード等)にも数回リトライする`fetchBlobWithRetry`ヘルパー(`lib/dropbox.ts`)を導入し、同種の問題への耐性を上げた

**プロフィール/ホーム画面のWEAR風ヒーローデザイン**
- `components/HeroScreen.tsx`を新設。濃色(ink色)のヘッダー領域の下に角丸の白系シートが被さって出てくるレイアウトで、シート上部にアイコン+ラベルのタブ(選択中のみ塗りつぶしアイコン+下線)を配置できる。WEARアプリのプロフィール/ホーム画面のスクリーンショットを参考に実装(仕様書には無い追加対応)
- `app/monitor-profile.tsx`: 「プロフィール情報」「子ども情報」の2タブ構成に変更。ヘッダーにアバター(頭文字丸アイコン)+氏名+Instagramアカウント名(@表示)を追加。ログアウトボタンはプロフィール情報タブの最下部のみに配置(ホーム画面など他画面からは撤去)
- `app/monitor-home.tsx`: 「未提出」「提出済み」の2タブ構成に変更(案件の`pendingCount`で振り分け)。ログアウトボタンを撤去(プロフィール画面に一本化)
- 管理者側画面・提出詳細/フォーム系画面など、他の画面はまだWEAR風ヒーローデザインに未対応(必要であれば次回以降のセッションで展開する)

## WEAR風ヒーローデザインを管理者側・残りの一覧画面にも展開(2026-08-25)

「管理ページや他のページも今回のwear風デザインを反映させて」の指示を受けて、フッタータブメニューを持つ全画面(=主要画面)を`HeroScreen`構成に統一した。`components/HeroScreen.tsx`はタブが1つ以下のときはタブ行自体を表示しない仕様に変更(自然な区分の無い画面向け)。

- `app/admin-home.tsx`: タブ無し(見出し+シートのみ)。ログアウトボタンをメニュー一覧の下に移動
- `app/admin-campaign-list.tsx`: 「進行中」「完了・中止」の2タブ(`status`で振り分け)
- `app/admin-monitor-list.tsx`: 「すべて」「有効」「招待中」「無効」の4タブ(`status`で振り分け)
- `app/admin-submission-list.tsx`: 既存の「タスク種別」フィルタ(全て/データ/SNS)をHeroScreenのタブ行に統合。ステータス等の他のフィルタはタブの下の折りたたみエリアに残した
- `app/admin-announcement-list.tsx`: タブ無し(配信は作成と同時に確定するため下書き等の区分が無いため)
- `app/submission-history.tsx`(モニター): 「確認待ち」「確認済み」の2タブ(タスクステータスで振り分け)
- `app/announcements.tsx`(モニター): 「未読」「既読」の2タブ

いずれも既存のクエリ・データ取得ロジックはそのまま(エラーハンドリングも維持)、レイアウトとタブによるクライアント側フィルタリングのみ追加。詳細・フォーム系の画面(admin-campaign-form/admin-submission-detail/admin-monitor-detail/campaign-detail/submission-form等)は従来どおりネイティブヘッダー+戻るボタンの構成のまま(WEARでも一覧系のみこのデザインで、詳細ページは通常のページ遷移になっているため)。

## 詳細・フォーム画面のヒーローデザイン統一、写真削除、プロフィールアイコン、子ども表示(2026-08-25)

「案件の詳細ページ(提出ページ)に飛んだらヘッダーとかがなくなってしまった。どの詳細ページにとんでも、このヘッダーのスタイルは統一したい」への対応として、詳細・フォーム系の画面もすべてHeroScreen構成に統一した(前回の記述は撤回)。

**ヘッダー統一(全12画面)**
- `components/HeroScreen.tsx`に`onBack`propを追加。指定すると濃色ヘッダーのタイトル左に戻る矢印(‹)を表示する。`lib/navigation.ts`の`goBackOrReplace(fallback)`(履歴があれば戻る、無ければ決まった画面へreplace。旧`components/HeaderBackButton.tsx`のロジックを関数化したもの。旧ファイルは削除)を使う
- 対象: `campaign-detail`/`submission-form`/`sns-submission-form`/`announcement-detail`(モニター)、`admin-invite-issue`/`admin-monitor-detail`/`admin-product-search`/`admin-watched-coupons`/`admin-coupon-orders`/`admin-campaign-form`/`admin-submission-detail`/`admin-announcement-form`(管理者)
- `app/_layout.tsx`は該当する全Stack.Screenを`headerShown: false`に変更(ネイティブヘッダーは完全に廃止)

**全ヘッダーへのアイコン+名前表示**
- `components/HeroProfileBadge.tsx`を新設。ログイン中本人のプロフィール(アイコン画像 or 頭文字丸/ニックネームまたは氏名+「様」)を取得して表示する。フッタータブのある9画面すべての`headerExtra`に配置
- `profiles.avatar_path`列を追加(migration `20260825000005_profile_avatar.sql`)。公開の`avatars`ストレージバケットを新設し、本人のprofile_id配下のみ書き込み可能に(RLS)。`app/monitor-profile.tsx`にアイコンをタップしてアップロードするUIを追加(プロフィール情報タブの写真+ヘッダーの小さいアイコン、両方から変更可能)
- `lib/campaigns.ts`に`profileDisplayName`(ニックネーム優先、無ければ`monitorDisplayName`にフォールバック)を追加

**アップロード済み・失敗ファイルの削除**
- `app/submission-form.tsx`: 提出済みファイルのサムネイルに×ボタン(タスクが確認済みでなければ表示)を追加、`submission_files`から削除。アップロード失敗(エラー)状態のファイルにも「削除」を追加(従来は「再試行」のみで、失敗分が溜まっていく問題があった)
- migration `20260825000004_submission_files_delete_policy.sql`: モニター本人が自分の`submission_files`を削除できるRLSポリシーを追加(既存は select/insertのみで、実は削除は常にRLSにより無効化されていた)。**要`npx supabase db push`**
- Dropbox上の実ファイル自体は削除していない(一覧からの削除のみ)。ストレージ容量を厳密に管理する必要が出てきたら別途対応

**子どもの表示形式**
- `lib/campaigns.ts`に`childDisplayName(callName)`(「そら」→「そらちゃん」)を追加。子ども一覧・提出フォームの子ども選択チップ/カード・管理画面の提出詳細・案件作成時の子ども選択、すべてに適用

**ステータスバーの色**
- Web版のiOSステータスバー(時刻・電波表示のあたり)がずっと白背景だった件を修正。Expo RouterのWeb静的出力専用機能`app/+html.tsx`はこのプロジェクトのSPA出力モードでは効かない(static出力に切り替えるとSupabaseクライアント初期化がSSRでクラッシュする問題が過去にあったため見送っている)ため、`scripts/patch-web-index-html.js`でビルド後の`dist/index.html`に直接`theme-color`等のmetaタグを追記する方式にした。`vercel.json`のbuildCommandに組み込み済みなので追加設定は不要。iOS Safari 15以降で反映される(それより古いバージョンでは効かない)

**Dropboxアップロードが依然失敗する件 → 根本原因を特定・修正(2026-08-25)**
- CORS修正は`curl.exe -i -X OPTIONS`で`Access-Control-Allow-Origin`ヘッダーが実際に返っていることを確認済み(正しくデプロイされていた)。それでもアップロードは「アップロードが完了しませんでした」という別のエラーで失敗し続けていた
- 真因は`lib/dropbox.ts`の`uploadFileToDropboxChunked`のループ条件`while (session.offset < session.totalSize)`。ファイル全体がCHUNK_SIZE(8MB)以下の場合、`upload_session/start`呼び出し1回で`session.offset`が`totalSize`まで進んでしまい、ループの条件が最初から偽になるため**本文を1度も実行せずループを素通りし、`upload_session/finish`が一度も呼ばれないままフォールスルーしていた**。スマホの写真は大半が8MB以下のため、実質すべての画像アップロードでこの不具合を踏んでいた(動画等8MBを超えるファイルでは通常のチャンク処理を通るため気づかれていなかった)
- 修正: ループを`while (true)`にし、残りバイト数が0でも`upload_session/finish`を(0バイトの最終チャンクとして)必ず呼ぶように変更。CORS不具合とは全く別の、独立したロジックバグだった

---

## モニター側の「詳細ページでもヘッダー/フッタータブを固定表示」対応(2026-08-25)

「ヘッダーは『あなたの案件』の時の表示のまま、アイコンのタブメニュー(フッター)もそのまま、それより下の領域に詳細ページを表示して、戻って、という表示の仕方にしたい」との要望に対応。expo-routerでの画面遷移(`router.push`)ではなく、**リスト画面自身が内部状態で「今どのビューを表示しているか」を持ち、同じHeroScreen(ヘッダー+フッタータブ)の中身だけを差し替える「マスター・ディテール」方式**に変更した。

- `app/campaign-detail.tsx`/`app/submission-form.tsx`/`app/sns-submission-form.tsx`/`app/announcement-detail.tsx`: それぞれ本体ロジックを`XxxContent({id/taskId/targetId, ...})`という名前付きコンポーネントとして分離してexport(HeroScreenでは包まない、生の中身のみ)。デフォルトエクスポート(ルートとしてアクセスされた場合。通知からの直接遷移など)は、そのContentコンポーネントを自分のHeroScreenで包むだけの薄いラッパーに変更
- `app/monitor-home.tsx`: `view`という状態(`list` / `campaign` / `submission` / `sns`)を持ち、行タップ時は`router.push`ではなく`setView(...)`でビューを切り替える。HeroScreenは常に1つのまま(ヘッダーの見出し「あなたの案件」・アイコン+名前・フッタータブは固定)で、`view`に応じてシート本体だけを「案件一覧」⇄「案件詳細」⇄「提出フォーム/SNS投稿フォーム」に差し替える。戻るボタン(HeroScreenの`onBack`)は一覧以外のときだけ表示され、押すと1階層戻る(提出フォーム→案件詳細→一覧)
- `app/announcements.tsx`も同様に`announcement-detail`を埋め込み化(一覧⇄詳細の2階層)
- 管理者側は当初未対応だったが、後続の対応で同じパターンを適用済み(下記参照)

---

## 管理者側にも「詳細ページでもヘッダー/フッタータブを固定表示」を適用(2026-08-25)

「マージしてよい。その後管理画面も直して欲しい」を受けて、モニター側で導入したマスター・ディテール方式を管理者側の全一覧⇄詳細/フォーム画面にも適用した。パターンはモニター側と同じ: 各詳細/フォーム画面の中身を`XxxContent({...})`という名前付きコンポーネントとして分離し(HeroScreenでは包まない)、デフォルトエクスポートはそのContentを自分のHeroScreenで包むだけの薄いラッパーに変更(通知や直接URLアクセス用のフォールバック)。リスト側は`view`という内部状態を持ち、行タップ/ボタン押下で`setView(...)`により同じHeroScreenの中身だけをリスト⇄詳細/フォームに差し替える。

- `app/admin-home.tsx`: `AdminProductSearchContent`/`AdminWatchedCouponsContent`/`AdminCouponOrdersContent`を埋め込み。「モニターを招待する」だけは主要導線がadmin-monitor-list側にあるため単独ルート遷移のまま
- `app/admin-monitor-list.tsx`: 「+招待する」→`AdminInviteIssueContent`、行タップ→`AdminMonitorDetailContent`を埋め込み
- `app/admin-campaign-list.tsx`: 「+新規案件」→`AdminCampaignFormContent`(新規作成モード)、行タップ→同コンポーネント(id指定で編集モード)を埋め込み。`AdminCampaignFormContent`はprefill用のprops名を`initialXxx`にリネームして、フォーム自身のstate名(`shippedAt`等)との衝突を回避。保存完了時は`onSaved`コールバックでリストに戻る(渡されなければ従来どおり`router.replace`)。クーポン注文の「案件化する」(`admin-coupon-orders.tsx`)は引き続き単独ルートへの`router.push`のまま(案件一覧セクションへの遷移になるため意図通り)
- `app/admin-submission-list.tsx`: 提出行のデータ/SNSタップ→`AdminSubmissionDetailContent`を埋め込み
- `app/admin-announcement-list.tsx`: 「お知らせを作成・配信する」→`AdminAnnouncementFormContent`を埋め込み。フォーム内の「配信内容を確認する」プレビュー切り替えは、このコンポーネント内で完結させたまま(親のリスト側には新しい`view`状態を追加していない)。送信完了時は`onSaved`でリストに戻る

`npx tsc --noEmit`・`npx expo export -p web`とも通過を確認済み。

---

## 画像アップロードが「Type error」で失敗する不具合を修正(2026-08-25)

Dropboxアップロードのチャンク処理バグ修正後も、一部のPNGファイル(スクリーンショット等)で「Type error」という詳細不明なエラーになりアップロードが完了しない不具合が発生した。

- 原因は`lib/mediaPipeline.ts`のGPS位置情報除去処理(`stripGpsMetadata`)。内部で使っている`@xoi/gps-metadata-remover`ライブラリが、一部の内部構造を持つPNGファイルのパース中に例外を投げることがあり、それがそのままキャッチされずアップロード処理全体を失敗させていた。WebKit(Safari)ではこの手の例外のメッセージが詳細を伴わない`"Type error"`という表示になるため、画面上は原因不明のエラーにしか見えなかった(Node上で再現・調査してライブラリ内部での例外発生を確認)
- 修正: `stripGpsMetadata`をtry/catchで包み、GPS除去に失敗した場合は元のファイルのまま後続のアップロード処理を継続するようにした(Web版・ネイティブ版とも)。サムネイル生成失敗時に既に採用していた「本体の提出は継続する」という方針をGPS除去にも適用した形。スクリーンショット等はそもそも位置情報を含まないケースが多く、位置情報を消せないことより提出物が一切アップロードできないことの方が実害が大きいと判断
- `npx tsc --noEmit`・`npx expo export -p web`とも通過を確認済み

**→ 上記の修正をリリース後も「Type error」が再発(2026-08-25追記)**。JPEGファイルでも発生したため、PNG固有のGPS除去ライブラリの問題という当初の診断は誤りだった(その修正自体は無害だが不十分)。改めて調査し、真因を特定・修正した(下記セクション参照)。

---

## 画像アップロードが「Type error」で失敗する不具合、真因を特定・修正(2026-08-25)

前セクションの修正後も、PNGだけでなくJPEGでも「Type error」が発生し続けた(=あらゆるファイルで確実に再現)ことから、GPS除去ライブラリ固有の問題という当初の診断が誤りだと判明。改めて`lib/dropbox.ts`を調査した。

- **真因**: Dropboxのチャンクアップロードは`Dropbox-API-Arg`という HTTPヘッダーに`{cursor, commit: {path, ...}}`をJSON化して渡す仕様になっている。この`path`(=`destPath`)は回次フォルダ名を含み、`lib/campaigns.ts`の`formatCycleFolderName`が生成する名前は必ず`第1回_20260830`のように**日本語(「第」「回」)を含む**。`lib/dropbox.ts`はこれを`JSON.stringify(apiArg)`でそのままヘッダー値にしていたが、ブラウザのFetch API(Headers)はヘッダー値にASCII(正確にはISO-8859-1)以外の文字を許容しておらず、日本語を含む文字列を渡すと`fetch()`が例外を投げる。WebKit(Safari)ではこの例外のメッセージが詳細不明な`"Type error"`になる。回次フォルダ名は常に日本語を含むため、**ファイルの種類やファイル名に関わらずWeb版のアップロードが原理的に100%失敗する**不具合だった(ネイティブ版は`expo-file-system`の`uploadAsync`を使っており、ブラウザのHeaders検証を経由しないため影響を受けていなかった)
- 修正: `Dropbox-API-Arg`ヘッダーを生成する`encodeDropboxApiArg()`を新設し、JSON化した文字列のうちASCII範囲外の文字を`\uXXXX`エスケープに変換してからヘッダーにセットするようにした(Dropbox公式ドキュメントが定めるこのヘッダーの仕様どおりの対応。Dropbox側はこの`\uXXXX`表記を含むJSONを正しく元の文字列として解釈する)。Web版・ネイティブ版の両方の送信経路(`callDropboxContentFromBlob`/`callDropboxContentFromFile`)に適用
- Node上で実際に日本語パスを含む`apiArg`をエンコード→デコードし、ASCII範囲内に収まること・元の文字列に正しく復元されることを確認済み
- `npx tsc --noEmit`・`npx expo export -p web`とも通過を確認済み

---

## Dropbox連携先を「App folder」から「Full Dropbox + 専用チームフォルダ」に変更(2026-08-25)

「大元のフォルダを変えたい。アプリの中に入り込んでくるのはわかりにくい」との要望を受けて対応。

**背景**: 従来は「App folder」方式のDropboxアプリを使っており、API経由で作られるフォルダは常にそのアプリ専用フォルダ(`アプリ/anoko. monitor app/`配下)の中にしか作れない仕様だった。Azusaさんの目には見えにくい場所になっていた。

**対応**:
- Azusaさんに新しいDropboxアプリ(Full Dropbox権限)を作成 → 認証してrefresh tokenを取得 → `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`/`DROPBOX_REFRESH_TOKEN`をSupabase Secretsに設定し直していただいた(値はチャットに貼らせず、ご本人のターミナルから`npx supabase secrets set`で実行)
- 「anoko.」がDropbox Businessのチームアカウントであることが判明。Full Dropbox権限でも既定では自分のホーム名前空間が起点になり、Azusaさんが新しく作成したチーム共有フォルダ「モニターデータ」(Team Space直下、`azusa ( anoko. )`と同列)は別の名前空間として扱われる仕様だった
- Dropbox APIの`Dropbox-API-Path-Root`ヘッダー(`{".tag": "namespace_id", "namespace_id": "..."}`)で名前空間を明示的に指定する方式に対応。`supabase/functions/_shared/dropbox.ts`に`getDropboxRootNamespaceId()`(`DROPBOX_ROOT_NAMESPACE_ID`環境変数を読む)を追加し、`createDropboxFolder`にこのヘッダーを付与するオプションを追加
- `dropbox-token` Edge Functionのレスポンスに`rootNamespaceId`を追加し、クライアント(`lib/dropbox.ts`)もアップロード・共有リンク作成の全fetch呼び出しに同ヘッダーを付与するよう変更
- `dropbox-create-campaign-folders`: `DROPBOX_ROOT_NAMESPACE_ID`が設定されている場合、案件フォルダは名前空間のルート直下(=「モニターデータ」フォルダ直下)に作成するよう変更し、従来の`/anoko_monitor`プレフィックスを省略(「モニターデータ」フォルダ自体がアプリ専用フォルダとして機能するため、その中で二重に`anoko_monitor`フォルダを作る必要が無い)。未設定時は従来どおりのプレフィックス付きパスにフォールバックする後方互換動作
- migration `20260825000006_fix_dropbox_base_path_prefix.sql`: 切り替え前に作成された既存案件の`dropbox_base_path`から旧`/anoko_monitor`プレフィックスを除去(新しい名前空間ルート基準のパスに揃える)。**要 `npx supabase db push`**
- 「モニターデータ」フォルダの`shared_folder_id`(= namespace_id)は`14991756083`。`npx supabase secrets set DROPBOX_ROOT_NAMESPACE_ID="14991756083"`・`npx supabase db push`ともAzusaさんに実行いただき完了
- `npx tsc --noEmit`・`npx expo export -p web`とも通過を確認済み

---

## アップロード再試行が壊れたセッションで永久に失敗し続ける不具合を修正(2026-08-25)

Dropbox連携先の切り替え作業中に試行された提出ファイル(`IMG_3753.png`)が、切り替え後も「Dropbox API error (upload_session/finish): 409」で「再試行」を押しても直り続けない状態になっていた。

- 原因: `lib/dropbox.ts`の`uploadFileToDropboxChunked`は、アップロード再開用のセッション情報(`session_id`等)を`resumeKey`(=`{submissionId}:{ファイル名}`)をキーにAsyncStorageへキャッシュしている。このセッションはDropbox連携先の名前空間に紐付いて作られるため、連携先を切り替える前に作られたセッションは切り替え後の名前空間からは無効になる。従来のコードはDropboxからのエラーが「オフセットのズレ」(`correct_offset`)由来でない場合、単に例外を再throwするだけでキャッシュ済みセッション自体は破棄していなかった。そのため「再試行」を押すたびに同じ壊れたセッションを読み込み続け、永久に同じエラーで失敗し続けていた
- 修正: オフセットのズレで説明できないDropbox APIエラーを検知した場合、そのセッションをキャッシュから破棄するようにした。破棄後の次回の「再試行」では`upload_session/start`からやり直されるため正常に完了する(この不具合を踏んでいたファイルは、修正デプロイ後に「再試行」をもう一度押せば直る)
- `npx tsc --noEmit`・`npx expo export -p web`とも通過を確認済み

---

## 案件一覧・回次一覧のデザイン刷新、Dropboxフォルダ構成の見直し、提出済みファイルの削除制限(2026-08-26)

「案件一覧ページについて、モニターを依頼されている商品名・そのサムネイルを表示して、なんの案件かぱっと見でわかるようなデザインに刷新してほしい」等の実機フィードバックに対応。

**モニター側「あなたの案件」一覧(`app/monitor-home.tsx`)**
- 各行に商品サムネイル(`products.image_url`)+商品名を表示するよう刷新(商品名をタイトル、案件名をその下の小さいキャプションに)。何の案件かアイコンではなく画像でぱっと見て分かるようにした
- 「未提出2」のような件数バッジをやめ、必要な提出内容ごとに「データ提出」「Instagram投稿」バッジ(`components/StatusPill.tsx`)を表示するよう変更。期限超過があれば赤系(overdue)、無ければアクセントカラーで表示。提出物が無ければ「提出済み」バッジを表示

**案件詳細の回次一覧(`app/campaign-detail.tsx`)**
- データ提出/SNS投稿それぞれをボタン風の行(アイコン+見出し+期限+ステータスバッジ)に変更し、テキストのみだった従来より区別しやすくした。データ提出は画像アイコン、Instagram投稿はInstagramロゴアイコンで視覚的に分離。ステータスに応じてバッジの色を変える`taskStatusTone()`ヘルパーを追加(差し戻し=rejected、提出済み/確認済み=accent、期限超過=overdue、それ以外=neutral)

**提出済みファイルの削除を制限(`app/submission-form.tsx` + migration)**
- 「提出済みのページでは、モニター側では一度提出したものの画像の削除はできないようにしたい」に対応。従来はタスクが`approved`(確認済み)でなければ削除ボタンを表示していたため、`submitted`(提出済み・確認待ち)の状態でも削除できてしまっていた
- クライアント側: 削除ボタンの表示条件を`taskStatus === 'pending' || taskStatus === 'rejected'`(下書き中・差し戻され再提出中の時だけ)に変更
- DB側: migration `20260826000001_restrict_submission_files_delete_after_submit.sql`で`submission_files`のdelete RLSポリシーも同じ条件に絞り込み(UIだけでなくAPIレベルでも提出済みファイルを削除できないようにするため)。**要 `npx supabase db push`**

**Dropboxフォルダ構成の見直み(`supabase/functions/dropbox-create-campaign-folders/index.ts`)**
- 「その中のフォルダも、SKUごとではなく商品ごとにフォルダ、案件No＋名前ではなくInstagramアカウント名にしておきたい」に対応
- 商品フォルダ: `{商品名}_{SKU}` → `{商品名}`のみ(同じ商品の別バリアントは同じフォルダに集約)
- 案件フォルダ: `{案件番号}_{モニター名}` → `{案件番号}_{Instagramアカウント名}`(Instagramアカウント未設定の場合は氏名等にフォールバック。案件番号は残す方針で確認済み)
- `sanitizeDropboxPathSegment`(`lib/campaigns.ts`・`supabase/functions/_shared/dropbox.ts`の両方、要同期)に、末尾の「.」やスペースを除去する処理を追加。ブランド名が「ANOKO.」のように末尾がピリオドの場合、Windows版Dropboxデスクトップアプリがローカル同期時に末尾を「_」へ勝手に置き換えてしまい「ANOKO_」という紛らわしい表示になっていた不具合の修正(実機で確認・再現)
- 既存案件(切り替え前に作成済みのテスト案件)の`dropbox_base_path`は今回は更新していない(旧構成のまま)。新規作成する案件から新しい構成になる

`npx tsc --noEmit`・`npx expo export -p web`とも通過を確認済み。実機での見た目確認は未実施。

---

## Edge Functionのエラーメッセージが本来の原因を隠してしまう不具合を修正(2026-08-26)

「案件登録時に注文を取り込もうとしたら『注文の取得に失敗しました』となって取り込みできなかった」との報告を受けて調査した結果、Shopify連携固有の問題ではなく、**Edge Functionを呼び出している全画面に共通する構造的な不具合**だと判明した。

- 原因: `supabase.functions.invoke()`は、呼び出したEdge Functionが2xx以外のステータスを返すと`data`を`null`にしてしまう仕様がある。Edge Function側は`{error: '...'}`というJSONで具体的な理由を返しているのに、そのJSON本体は`error.context`という別のResponseオブジェクトの中に入っていて、明示的に`.json()`で読み直さないと取得できない。既存コードは各画面で`data?.error ?? '〜に失敗しました'`という書き方をしていたため、2xx以外が返るケース(バリデーションエラー・外部API側のエラー・secrets未設定等、実質ほとんどのエラーケース)で常に本来のエラーメッセージが読めず、汎用メッセージにフォールバックしていた。これが「注文の取得に失敗しました」しか出ず原因が分からなかった直接の原因
- 修正: `lib/supabase.ts`に`invokeEdgeFunction()`という共通ヘルパーを新設。`error.context`から本来のJSONエラーメッセージを正しく取り出すようにした。`supabase.functions.invoke()`を直接呼んでエラーをユーザーに表示していた全箇所(`admin-campaign-form.tsx`の注文取込・商品検索・Dropboxフォルダ作成、`admin-watched-coupons.tsx`、`admin-product-search.tsx`、`register.tsx`、`lib/dropbox.ts`のトークン取得)をこのヘルパー経由に置き換えた
- これにより、今後Edge Function側のエラーで問題が起きた際は、画面に表示されるメッセージが実際の原因(Shopify APIのエラー内容・secrets未設定・404等)を正しく示すようになる。注文取込の不具合自体の直接原因はまだ特定できていない(今回の修正後、実際にどんなメッセージが出るか確認してから次を判断する)
- `npx tsc --noEmit`・`npx expo export -p web`とも通過を確認済み

---

## Shopify注文取込が常に「注文が見つかりませんでした」になる不具合を修正(2026-08-26)

前セクションのエラーメッセージ可視化の修正により、注文取込の実際のエラーが「注文が見つかりませんでした」だと判明。真因を特定した。

- 原因: `supabase/functions/shopify-order-lookup/index.ts`が、Shopifyの注文検索クエリを組み立てる際に注文番号の先頭の「#」を取り除いてから`name:1001`のような形でクエリを送っていた。しかしShopifyの注文検索(`name:`フィルタ)は、注文名に含まれる「#」も検索語に含めないと一致しない仕様(`name:1001`ではヒットせず`name:#1001`でないとヒットしない)。そのため、入力欄に「#」を付けても付けなくても、どんな注文番号を入力しても必ずヒットしない状態になっていた
- 修正: クエリ組み立て時に必ず`#`を付け直すようにした(`name:#${normalizedOrderNumber}`)。入力欄への「#」の有無に関わらず正しく検索できる
- `npx tsc --noEmit`・`npx expo export -p web`とも通過を確認済み(Edge Function自体はDeno実行のためtscの対象外)

**→ Edge Functionsは`git push`/PRマージだけでは反映されない(2026-08-26追記)**。Vercelは画面(`vercel.json`のbuildCommand)のみ自動デプロイし、Supabase Edge Functionsは`npx supabase functions deploy`を別途手動実行しないと反映されないことが判明(前セクションの「#」修正をマージ後、実機で試しても直っていなかった原因)。Azusaさんに`npx supabase functions deploy`(全関数まとめてデプロイ)を実行いただき反映を確認。**今後Edge Functionを変更するPRでは、マージ後に必ずこのコマンドの実行を案内すること**

---

## Shopify注文取込、「#」を付けても注文が見つからない件をさらに調査(2026-08-26)

前セクションの修正(検索クエリに「#」を付け直す)をEdge Function再デプロイ後に試したが、それでも同じ注文番号(#31393)で「注文が見つかりませんでした」のままだった。

- Shopifyの注文検索GraphQL(`orders(query: "name:...")`)は、権限不足(`read_orders`スコープ未許可等)や検索構文の問題があってもHTTPステータスは200 OKのまま返り、エラー内容はレスポンスボディの`errors`配列に入る仕様。従来のコードはこの`errors`配列を見ておらず、`data.orders`が空なら常に「見つかりませんでした」の404を返していたため、本当の原因(権限不足なのか、単に注文名の表記が違うだけなのか)を区別できていなかった
- 修正: `json.errors`が存在する場合はそれを`Shopify APIエラー: ...`として返すようにした。あわせて404時のメッセージに「Shopify管理画面で注文番号の表記(先頭の#や接頭辞など)をご確認ください」という案内を追加(ストアによっては注文名が独自の接頭辞・接尾辞付きの場合があり、`#31393`という表記自体が実際の注文名と一致していない可能性があるため)
- この修正で次に試した際に、権限不足なのか表記の違いなのかが特定できる見込み。**要Edge Functionの再デプロイ**
- `npx tsc --noEmit`・`npx expo export -p web`とも通過を確認済み

**→ 真因を特定(2026-08-26追記)**。GraphQLエラー(権限不足等)は出ておらず、商品検索は正常に動くことを確認。今日の未発送の新しい注文(例: #34369)では取り込めるが、古い注文(#31393、既に発送済みと思われる)では取り込めない、という切り分けができた。Shopifyの注文検索はクエリに`status:`を指定しないと**デフォルトで「未処理(open)」の注文しか対象にならない**仕様があり、発送・クローズ済みの古い注文が対象外になっていたのが真因。検索クエリに`status:any`を追加して全ステータスを対象にするよう修正した(`supabase/functions/shopify-order-lookup/index.ts`)。**要Edge Functionの再デプロイ**

**→ status:any追加後も再現(2026-08-26さらに追記)**。Edge Functionの再デプロイ(2回、ログ確認済みで成功)後も同じ注文(#31393、Shopify管理画面で確認したところ表記は正確に一致・「アーカイブ済み」)で「見つかりませんでした」のまま。`status:any`で理論上カバーされるはずのケースなのに直らないため、これ以上憶測で直すのをやめ、Shopifyから実際に返ってきているレスポンスをそのまま「見つかりませんでした」メッセージに含める一時的なデバッグ出力を追加した(原因特定後に削除予定)。次にAzusaさんが試した際の画面のメッセージから、GraphQLが実際に何を返しているか確認する

**→ デバッグ出力で真因を確定(2026-08-26さらに追記)**。実機で表示されたデバッグ情報に`"warnings":[{"field":"status","message":"Input \`any\` is not an accepted value.","code":"invalid_value"}]`と明確に出ていた。REST APIの`status=any`パラメータとは別物で、このGraphQL検索構文の`status:`フィールドは`any`という値を受け付けない(警告により実質無視され、ステータス指定なしと同じ扱いになっていた)。有効な値は`open`/`closed`/`cancelled`のみなので、`(status:open OR status:closed OR status:cancelled)`という形でOR結合するよう修正した。デバッグ出力は動作確認できるまで一旦残してある(確認でき次第、別PRで削除予定)

**→ OR結合後も再現、検索インデックス自体の制約と判明(2026-08-26さらに追記)**。`(status:open OR status:closed OR status:cancelled)`に修正・再デプロイ後も、同じ注文(#31393、アーカイブ済み)が見つからないまま(デバッグ情報上は`warnings`が消え、クエリ構文自体は正しく解釈されているが`edges`は空)。これにより、`status:`の値の問題ではなく、**Shopifyの検索インデックス(`orders(query: ...)`が内部で使う全文検索)自体がアーカイブ済みの古い注文を含んでいない**という、より根本的な制約であると判断した

## Shopify注文取込: 検索インデックスに頼らないフォールバック(ページ送り探索)を実装(2026-08-26)

- 対応: `supabase/functions/shopify-order-lookup/index.ts`を全面的に書き直し、2段構えにした
  1. まず従来どおり`query:`引数での検索(高速パス)を試す
  2. 見つからなければ、`query:`引数を使わない素の一覧取得(`orders(first: 250, after: $cursor, sortKey: ID, reverse: true)`、検索インデックスを経由しないためアーカイブ済みも含まれるはず)を新しい順に最大20ページ(5000件)までページ送りしながら、注文名が完全一致するものを探すフォールバックを実行
  3. ページ送り中は`id`/`name`のみの軽量クエリにし、一致した注文が見つかった時点で1回だけ`order(id: ...)`で詳細(lineItems等)を取得する(パフォーマンス配慮)
- 一時的なデバッグ出力(Shopifyの生レスポンスをそのまま表示する処理)はこのタイミングで削除し、通常のエラーメッセージに戻した
- `npx tsc --noEmit`は通過(Edge Function自体はDeno実行のため対象外)。**要Edge Functionの再デプロイ**。今回は検索インデックスの制約という、コードの書き方では検知しづらい真因だったため、次に試しても直らない場合はさらに別の要因(古い注文がAPIレスポンス自体から除外されている等)を検討する

**→ ページ送りフォールバックでも見つからず(2026-08-26さらに追記)**。デプロイ後に再度実機で試したが、同じ注文(#31393)が相変わらず見つからない。ページ送り処理自体がどこかで静かに失敗している可能性がある(エラー時にnullを返すだけでエラー内容を握りつぶす作りだった)ため、`findOrderByPagination`にページごとの取得件数・先頭/末尾の注文名・エラー内容を記録するdebug情報を追加し、404メッセージにそのまま含めるようにした(原因特定後に削除予定)。次にAzusaさんが試した際のデバッグ情報で、ページ送りが実際に何ページ分・どの注文名の範囲まで進んだか、あるいはどこでエラーになっているかを確認する

**→ 真因を確定(2026-08-26さらに追記)**。デバッグ情報で判明: ページ送り(`query:`を使わない素の一覧取得)が`#33008`まで遡ったところで`"exhausted":true`(=「もうこれ以上古い注文は無い」)を返して打ち切られていた。実際にはこれより古い注文(#31393含む)が存在するはずなのに打ち切られていることから、コードの不具合ではなく**Shopifyの標準アクセススコープ(`read_orders`)による「直近60日分の注文しかAPI経由で取得できない」という制限**に当たっていると判断した(60日より古い注文を見るには`read_all_orders`という拡張スコープが別途必要。Shopify側の既知の仕様)。

## Shopify注文取込: 60日を超える古い注文はAPI権限の制約で取得不可と判明(2026-08-26)

- デバッグ用のコード(生レスポンスをそのまま表示する処理)を削除し、この制約を踏んだ場合にわかりやすい案内を返すよう修正した: 「Shopifyの標準権限(read_orders)では直近60日分の注文しかAPI経由で取得できません(現在API経由で確認できる最も古い注文: ◯◯)。これより古い注文を取り込むには、Shopify側でアプリに「read_all_orders」権限を追加していただくか、商品を手動で選択してください。」
- **Azusaさんへの相談事項**: 60日より古い注文もこの取込機能で使えるようにしたい場合、Shopifyの管理画面(このアプリを作成したDev Dashboard)でアプリに`read_all_orders`スコープを追加する設定が必要(要Azusaさんの対応・場合によってはShopify側の承認が必要になる可能性あり)。60日以内の注文だけで運用上問題なければ、対応不要(その場合は商品を手動選択する運用でカバー)
- `npx tsc --noEmit`通過。**要Edge Functionの再デプロイ**
- **→ 解決(2026-08-26追記)**。Azusaさんが`read_all_orders`スコープを追加、実機で#31393の取込に成功したことを確認

## モニター側で商品情報・画像が見えない不具合を修正(2026-08-26)

- 実機フィードバック: 「あなたの案件」一覧・案件詳細ページで、管理側では商品登録済みのはずの案件が「商品情報なし」・画像なしと表示される
- 原因: `products`/`variants`テーブルに管理者/スタッフ向けのRLSポリシー(`for all`)しか無く、モニター向けのSELECTポリシーが存在しなかった。案件作成自体(商品の保存・案件への紐付け)は成功していたが、モニターが自分の案件を開いた際に`products`/`variants`への問い合わせがRLSにより常に空を返していた
- 対応: `supabase/migrations/20260826000002_monitor_select_products_variants.sql`で、自分にアサインされた案件(`campaign_variants`経由)に紐づく商品・バリアントのみ閲覧できるSELECTポリシーを追加
- 合わせて`app/campaign-detail.tsx`で商品情報カードの取得に`image_url`を含めるようにし、商品名の上に画像(64x64、無ければ「No Image」)を表示するようにした(実機フィードバック: 「案件の詳細ページには、依頼された商品情報などの詳細や画像も上部に表示したい」)
- `npx tsc --noEmit`通過。**要マイグレーション適用**(`npx supabase db push`。Edge Functionの変更は無いのでfunctions deployは不要)

## モニター登録時の規約・プライバシーポリシーの文面を作成(2026-08-26)

- `app/consent.tsx`の「(規約文面は準備中です)」というプレースホルダーを、実際の規約文面(全10条: 適用/モニター登録/商品の提供/モニターの義務/提出物の利用/禁止事項/個人情報の取り扱い/登録の抹消/規約の変更/お問い合わせ)に差し替えた
- 運営者表記・お問い合わせ先・所在地の記載有無はAzusaさんに確認のうえ決定(運営者名「anoko.」、問い合わせ先メールは`main@anoko-official.com`、所在地は記載しない)
- ECサイト掲載/SNS掲載/広告利用の同意トグルは既存のまま維持し、規約文の直後に「同意いただける項目を選択してください」という見出しを追加して繋がりをわかりやすくした
- **注記**: この規約文面はドラフトとして作成したもの。実際にアプリ配信・ストア審査に使う前に、必要であれば弁護士等専門家によるレビューを推奨する
- `npx tsc --noEmit`通過。アプリコードのみの変更で、DB/Edge Functionの変更は無い

## バリエーション名がSKU番号のまま表示される不具合を修正、案件登録の日付をカレンダー選択に統一(2026-08-26)

- 実機フィードバック: 「バリエーションについて、SKUを表示してもなんのことかわからないから、バリエーション名を表示してほしい(この画面に限らず案件登録時なども)」
- 原因: 商品検索・注文取込の際、Shopifyのオプション名が「size」「サイズ」「color」「カラー」等の決まった名前と一致する場合しかサイズ・カラーを抽出しておらず、それ以外の商品(オプション名が独自のもの、または単一バリエーションの商品)ではサイズ・カラーが空になり、SKU番号だけが表示されていた
- 対応: Shopify側が自動生成する人間可読なバリエーション名(`variant.title`。例:「フリー」「S / ピンク」)をそのまま取得・保存・表示する方式に変更
  - `variants`テーブルに`title`列を追加(`supabase/migrations/20260826000003_variant_title.sql`)
  - `shopify-product-search`・`shopify-order-lookup`の両Edge Functionで`variant.title`を取得し、Shopify既定値の「Default Title」の場合はnullとして返すようにした
  - `lib/campaigns.ts`に共通の`variantLabel()`ヘルパーを新設(優先順位: バリエーション名 → サイズ/カラー → SKU)。案件登録画面・案件詳細・提出フォーム・提出確認画面など、バリエーションを表示している全箇所をこのヘルパーに統一
  - 既に登録済みの商品は`title`が空のままなので反映されない問題への対応として、Shopifyから再取得する一度きりの管理者用ツール(`shopify-resync-variant-titles` Edge Function)を新設し、案件一覧画面に「バリエーション名を再取得」ボタンを追加した
- 合わせて、案件登録時の提出期限日・開始月・SNS投稿期限日の入力を、手入力(YYYY-MM-DD形式のテキスト欄)からカレンダー選択(既存の`CalendarPicker`コンポーネント。撮影日・子どもの生年月で使っているものと同じ)に統一した(実機フィードバック: 「案件登録時の期限などの設定時のカレンダー表示もお願い」)
- `npx tsc --noEmit`通過。**要マイグレーション適用(`npx supabase db push`)・要Edge Functionの再デプロイ**(`shopify-product-search`・`shopify-order-lookup`・新規の`shopify-resync-variant-titles`の3つ)。デプロイ後、案件一覧の「バリエーション名を再取得」ボタンを一度押してもらうと、登録済みの商品にもバリエーション名が反映される

## 確認済み(approved)の提出も追加提出を何度でもできるように変更(2026-08-26)

- 実機フィードバック: 「提出済みの案件について、追加提出が何度でもできるようにもしたい」
- これまでは`app/submission-form.tsx`・`app/sns-submission-form.tsx`とも、タスクが「確認済み(approved)」になった時点で画面全体が編集不可(`readOnly`)になり、それ以上ファイルを追加したり内容を編集したりできなかった
- 対応: `readOnly`による画面ロックを撤廃し、確認済みの提出でも写真・動画の追加やURL・メモの編集を随時行えるようにした。追加提出すると、タスクのstatusは自動的に「確認待ち(submitted)」に戻り、管理側の再確認対象になる(仕組みは差し戻し後の再提出と同じ)
- 提出済みボタンのラベルは、確認済みの状態から追加提出する場合のみ「追加で提出する」に変更(それ以外は従来通り「提出する」)
- 既に一度提出したファイルの削除は引き続きできない(pending・rejectedの時のみ削除可、という既存ルールは変更していない)。今回追加できるのは新しいファイルの「追加」のみ
- **重要**: 画面側だけでなく、`tasks`/`submissions`/`submission_files`/`submission_children`/`submission_child_variants`へのモニターからのINSERT/UPDATE系RLSポリシーが、いずれも「status <> 'approved'」の場合のみ許可する条件になっていたため、画面を編集可能にしただけではRLS違反で保存に失敗する状態だった。`supabase/migrations/20260826000004_allow_resubmission_after_approval.sql`で、該当ポリシーの条件を「cancelledでなければ許可」に緩和した(承認取り消し等の運用は無いため、approvedを弾いていた制約はcancelledのみに絞って問題ない)
- `npx tsc --noEmit`通過。**要マイグレーション適用(`npx supabase db push`)**。Edge Functionの変更は無い

## 本登録画面の改善(ボタンの影・必須表示・Instagram確認・パスワード確認欄・都道府県プルダウン)(2026-08-26)

- 実機フィードバック: 「登録するボタンに変な白っぽいシャドーがかぶっている」「各表示項目を必須項目として」「Instagramアカウント名も編集不可の状態で表示だけしたい(間違いないかの確認)」「パスワードの設定も確認用入力欄が欲しい」「都道府県の選択は北海道から順にプルダウンで表示できたらうれしい」
- **ボタンの白っぽい影**: Web版で、ボタンをタップ/クリックした際にブラウザ既定のフォーカスの縁取り・タップハイライトが白っぽく重なって見えていた。`global.css`に`-webkit-tap-highlight-color: transparent`と`[role='button']`のfocus時outline/box-shadow抑制を追加(全画面のボタン共通の見た目改善)
- **必須表示**: `app/register.tsx`の各項目ラベルに「(必須)」を追加。あわせて送信前チェックにメールアドレスの未入力チェックが漏れていたのを追加した
- **Instagramアカウント名の確認表示**: 招待コード入力画面(`app/invite-code.tsx`)で、次へ進む前に新設の`invite-code-lookup` Edge Functionでコードの有効性を確認するように変更(不正なコードをこの時点で弾けるようになった副次効果もあり)。取得したInstagramアカウント名を本登録画面に引き継ぎ、編集不可の表示専用項目として一番上に表示するようにした(誤りがないか本人が確認できるように)
- **パスワード確認欄**: `app/register.tsx`に「パスワード(確認用)」欄を追加し、一致しない場合はエラーを表示して送信をブロックするようにした
- **都道府県プルダウン**: 自由入力のテキスト欄から、北海道→沖縄県の順に47都道府県を選択できるプルダウン(`components/PrefecturePicker.tsx`。CalendarPickerと同様、ネイティブモジュールに依存しないModal+リストの自前実装)に変更した
- 対応範囲は今回「本登録画面」に限定。管理画面側のモニター詳細・モニター自身のプロフィール編集画面にも都道府県のテキスト入力欄が残っているので、同様にプルダウン化したい場合は別途対応する
- `npx tsc --noEmit`通過。**要Edge Functionの新規デプロイ**(`invite-code-lookup`)。DBマイグレーションの変更は無い

## 同じパターンの箇所を横展開(日付カレンダー・都道府県プルダウン)(2026-08-26)

- 実機フィードバック: 「同じような個所は全部同じように変更してほしい(日付カレンダーや都道府県など)」を受け、アプリ全体を洗い出して残っていた箇所を対応
  - `app/admin-monitor-detail.tsx`: モニター詳細(管理画面)の都道府県編集を、テキスト入力から`PrefecturePicker`(プルダウン)に変更
  - `app/admin-submission-detail.tsx`: 差し戻しモーダルの「新しい提出期限」を、YYYY-MM-DD手入力から`CalendarPicker`に変更
- `app/monitor-profile.tsx`の都道府県欄は元々モニター本人には編集不可(表示のみ)の設計のため、対象外とした
- 他にYYYY-MM-DD形式の手入力欄・都道府県のテキスト入力欄が残っていないことを全画面ざっと確認済み
- `npx tsc --noEmit`通過。アプリコードのみの変更で、DB/Edge Functionの変更は無い

---

## 未確定・要確認事項の記録

- Dropbox Scoped App / Supabaseプロジェクトは未作成(2026-07-09時点)。M1着手前に準備が必要
- GitHub連携: Dropbox同期フォルダ内でのgit運用リスクを軽減するため、GitHubプライベートリポジトリの作成を推奨(リポジトリURL共有待ち)
