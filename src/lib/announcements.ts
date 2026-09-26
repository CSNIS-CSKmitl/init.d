export interface PublicAnnouncement {
  id: string; title: string; body: string; priority: 'info' | 'important' | 'emergency';
  revision: string; link_label: string; link_url: string; source_url: string;
  start_at: string; end_at: string;
}
export const announcementPriorityLabels = { info: 'ทั่วไป', important: 'สำคัญ', emergency: 'ฉุกเฉิน' } as const;
export function announcementLink(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
