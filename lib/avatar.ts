import { supabase } from './supabase';

// avatarsは公開バケットのため、signed URLを都度取得する必要が無く同期的に組み立てられる
// (thumbnails/児童写真バケットのような非公開データとは扱いが異なる)。
export function avatarPublicUrl(avatarPath: string | null | undefined): string | null {
  if (!avatarPath) return null;
  return supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl;
}
