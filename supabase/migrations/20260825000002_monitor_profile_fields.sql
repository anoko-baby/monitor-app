-- モニター招待・登録フローの項目変更。
-- 招待時: 氏名/ニックネームではなくInstagramアカウント名のみで仮登録する。
-- 本登録時: モニター本人が氏名・都道府県・電話番号・メールアドレスを入力する。
-- そのため氏名はもう仮登録時点では確定しないので nullable にし、instagram_handle/prefecture/phone を追加する。

alter table profiles alter column name drop not null;
alter table profiles add column instagram_handle text;
alter table profiles add column prefecture text;
alter table profiles add column phone text;

comment on column profiles.instagram_handle is '招待時に入力するInstagramアカウント名(@は含めない)。本登録前のモニター識別用';
comment on column profiles.name is '本登録(招待コード入力)時にモニター本人が入力する氏名。招待時点ではnull';
