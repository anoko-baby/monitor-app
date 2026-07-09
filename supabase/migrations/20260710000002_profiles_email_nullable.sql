-- 管理者/スタッフが仮登録する時点ではモニターのメールアドレスはまだ分からない
-- (3.1.1: 仮登録は氏名・ニックネームのみ。メールは本登録=招待コード入力時に本人が設定する)。
-- そのため NOT NULL 制約は外し、本登録完了(status='active')時にアプリ側で必須にする。
alter table profiles alter column email drop not null;
