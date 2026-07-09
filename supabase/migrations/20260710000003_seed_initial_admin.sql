-- 初期管理者のprofiles行を、Supabase Authenticationで既に作成済みのユーザーに紐付ける。
-- 3.1.2: 初期管理者はシード登録。
insert into profiles (auth_user_id, role, name, email, status)
select id, 'admin', 'Azusa', email, 'active'
from auth.users
where email = 'main@anoko-official.com'
  and not exists (
    select 1 from profiles where auth_user_id = auth.users.id
  );
