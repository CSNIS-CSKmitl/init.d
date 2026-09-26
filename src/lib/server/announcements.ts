import type PocketBase from 'pocketbase';
import type { PublicAnnouncement } from '$lib/announcements';
export async function loadAnnouncements(pb: PocketBase, site: 'initd' | 'printer') {
  return pb.collection('announcements').getFullList<PublicAnnouncement>({
    filter: pb.filter('status = "published" && (targets ~ "all" || targets ~ {:site}) && (start_at = "" || start_at <= @now) && (end_at = "" || end_at > @now)', { site }),
    sort: 'priority,-updated', fields: 'id,title,body,priority,revision,link_label,link_url,source_url,start_at,end_at'
  });
}
