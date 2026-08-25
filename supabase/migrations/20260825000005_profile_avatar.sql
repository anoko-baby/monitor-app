-- プロフィールアイコン(実機フィードバック: 「プロフィールとしてアイコンの登録もできるように」)。
-- avatarsバケットは他人の名前・顔と紐づく個人情報ではあるが、プロフィール画像として
-- 全ヘッダーに表示する用途上、都度署名付きURLを取得する必要のない公開バケットにする
-- (thumbnails/childrenの写真のような非公開の実データとは性質が異なるため)。

alter table profiles add column avatar_path text;
comment on column profiles.avatar_path is 'avatarsバケット内のパス(公開URL)。本人が任意で設定するプロフィールアイコン';

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "anyone can read avatars" on storage.objects
  for select using (bucket_id = 'avatars');

-- パス規則: {profile_id}/avatar.* 。本人のprofile_id配下のみ書き込み可能にする
create policy "user can upload own avatar" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = current_profile_id()::text
  );

create policy "user can update own avatar" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = current_profile_id()::text
  );

create policy "user can delete own avatar" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = current_profile_id()::text
  );
