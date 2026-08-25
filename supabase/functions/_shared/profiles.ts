// モニターの表示名。招待直後(本登録前)はprofiles.nameがnullなので、
// その場合はinstagram_handleにフォールバックする。
// lib/campaigns.ts の monitorDisplayName と同じロジック(要同期)。
export function monitorDisplayName(m: { name: string | null; instagram_handle?: string | null } | null | undefined): string {
  if (!m) return 'モニター不明';
  return m.name ?? (m.instagram_handle ? `@${m.instagram_handle}(本登録前)` : 'モニター名未設定');
}
