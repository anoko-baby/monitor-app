import { TabItem } from '../components/BottomTabBar';

// 管理者/モニターそれぞれの主要画面(タブ)一覧。BottomTabBarを表示する画面すべてで
// 同じ配列を使い回すことで、画面ごとに項目がずれるのを防ぐ。
export const ADMIN_TAB_ITEMS: TabItem[] = [
  { label: 'ホーム', href: '/admin-home', icon: 'home-outline', activeIcon: 'home' },
  { label: '案件一覧', href: '/admin-campaign-list', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  {
    label: '提出一覧',
    href: '/admin-submission-list',
    icon: 'document-text-outline',
    activeIcon: 'document-text',
  },
  { label: 'モニター', href: '/admin-monitor-list', icon: 'people-outline', activeIcon: 'people' },
  {
    label: 'お知らせ',
    href: '/admin-announcement-list',
    icon: 'megaphone-outline',
    activeIcon: 'megaphone',
  },
];

export function monitorTabItems(unreadAnnouncements: number): TabItem[] {
  return [
    { label: 'ホーム', href: '/monitor-home', icon: 'home-outline', activeIcon: 'home' },
    { label: '提出履歴', href: '/submission-history', icon: 'time-outline', activeIcon: 'time' },
    {
      label: 'お知らせ',
      href: '/announcements',
      icon: 'notifications-outline',
      activeIcon: 'notifications',
      badge: unreadAnnouncements,
    },
    { label: 'プロフィール', href: '/monitor-profile', icon: 'person-outline', activeIcon: 'person' },
  ];
}
