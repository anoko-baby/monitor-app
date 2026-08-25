import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { avatarPublicUrl } from '../lib/avatar';
import { profileDisplayName } from '../lib/campaigns';
import { supabase } from '../lib/supabase';
import { Avatar } from './Avatar';

type BadgeProfile = {
  name: string | null;
  nickname: string | null;
  instagram_handle: string | null;
  avatar_path: string | null;
};

// 実機フィードバック「全ヘッダーにアイコンと名前(ニックネーム+さま)を表示させたい」に対応。
// 各HeroScreenのheaderExtraにこれを渡すだけで、現在ログイン中の本人のアイコン+名前が出る。
export function HeroProfileBadge() {
  const [profile, setProfile] = useState<BadgeProfile | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('profiles')
        .select('name, nickname, instagram_handle, avatar_path')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      setProfile(data);
    })();
  }, []);

  if (!profile) return null;

  const displayName = profileDisplayName({
    name: profile.name,
    nickname: profile.nickname,
    instagramHandle: profile.instagram_handle,
  });
  const avatarUrl = avatarPublicUrl(profile.avatar_path);

  return (
    <View className="flex-row items-center mt-4" style={{ gap: 10 }}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} />
      ) : (
        <Avatar label={displayName} size={32} />
      )}
      <Text className="font-body-medium text-caption text-white">{displayName}様</Text>
    </View>
  );
}
