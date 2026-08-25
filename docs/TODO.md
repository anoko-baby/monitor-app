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

**Dropboxアップロードが依然失敗する件(未解決・要確認)**
- 「画像はやっぱりアップロードできない」「管理ページの提出済み一覧からもDropboxには飛べなくなってる」「トークンの取得に失敗」との報告。コード上は前回のCORS修正(`supabase/functions/dropbox-token/index.ts`へのOPTIONS対応追加)がmainに残っており後退していないことを確認済み。管理画面側の「Dropboxフォルダを開く」も同じ`getDropboxAccessToken()`(`lib/dropbox.ts`)を経由しており、両方が同じ「Failed to send a request to the Edge Function」で失敗しているのは同一原因(CORS未反映)を示唆している
- 最有力の仮説: `npx supabase functions deploy dropbox-token`を実行した時点のローカル作業フォルダが、修正後のコードを`git pull`していない状態だった(Dropbox同期フォルダでの開発のため、mainへのマージ後にpullし忘れると起こり得る)。デプロイは常にローカルファイルの中身をそのまま送るため、pull前のデプロイは無意味
- 次回確認すべきこと: ①ローカルで`git log -1 --oneline -- supabase/functions/dropbox-token/index.ts`を実行し、コミット`959ce45`(実機フィードバック対応: Dropboxトークン取得のCORS不具合...)が含まれているか確認 ②`npx supabase functions deploy dropbox-token`を再実行 ③デプロイ後、ブラウザの開発者ツール(またはcurl)でOPTIONSリクエストの応答に`Access-Control-Allow-Origin`ヘッダーが付いているか確認

---

## 未確定・要確認事項の記録

- Dropbox Scoped App / Supabaseプロジェクトは未作成(2026-07-09時点)。M1着手前に準備が必要
- GitHub連携: Dropbox同期フォルダ内でのgit運用リスクを軽減するため、GitHubプライベートリポジトリの作成を推奨(リポジトリURL共有待ち)
