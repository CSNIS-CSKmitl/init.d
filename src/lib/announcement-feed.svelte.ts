import type { PublicAnnouncement } from '$lib/announcements';
export class AnnouncementFeed {
  items = $state<PublicAnnouncement[]>([]);
  selected = $state<PublicAnnouncement | null>(null);
  loaded = $state(false);
  unavailable = $state(false);
  isOpen = false;
  private dismissed = new Set<string>();
  private stopped = false;
  private controller: AbortController | null = null;
  private initialized = false;
  constructor(private fallback: PublicAnnouncement | null, private onUnread: (unseen: boolean) => void, private onRemoved: () => void) {}
  private key(item: PublicAnnouncement) { return `${item.id}:${item.revision}`; }
  async refresh() {
    if (this.stopped || this.controller) return;
    this.controller = new AbortController();
    const timeout = setTimeout(() => this.controller?.abort(), 10000);
    try {
      const response = await fetch('/api/announcements', { signal: this.controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Announcements unavailable');
      const result = await response.json() as { items: PublicAnnouncement[]; configured: boolean };
      if (this.stopped) return;
      this.unavailable = !result.configured;
      this.accept(result.configured ? result.items : this.fallback ? [this.fallback] : []);
    } catch {
      if (!this.stopped) {
        this.unavailable = true;
        // Keep the last successfully fetched announcements during an outage.
        if (!this.loaded) this.accept(this.fallback ? [this.fallback] : []);
      }
    } finally { clearTimeout(timeout); this.controller = null; }
  }
  private accept(items: PublicAnnouncement[]) {
    const ranks = { emergency: 0, important: 1, info: 2 };
    this.items = [...items].sort((a, b) => ranks[a.priority] - ranks[b.priority]);
    this.loaded = true;
    if (this.selected) {
      const current = this.items.find(item => item.id === this.selected?.id);
      if (!current) { this.selected = null; this.isOpen = false; this.onRemoved(); }
      else this.selected = current;
    }
    const unseen = this.items.find(item => !this.dismissed.has(this.key(item)));
    if (unseen && !this.isOpen) { this.selected = unseen; this.isOpen = true; this.onUnread(true); }
    else if (!this.initialized) this.onUnread(false);
    this.initialized = true;
  }
  markRead() { for (const item of this.items) this.dismissed.add(this.key(item)); this.isOpen = false; }
  nextUnread() {
    if (this.selected) this.dismissed.add(this.key(this.selected));
    this.isOpen = false;
    const next = this.items.find(item => !this.dismissed.has(this.key(item)));
    if (next) { this.selected = next; this.isOpen = true; }
    return !!next;
  }
  select(offset: number) {
    const index = this.items.findIndex(item => item.id === this.selected?.id);
    this.selected = this.items[(index + offset + this.items.length) % this.items.length] || null;
  }
  start() {
    this.stopped = false;
    void this.refresh();
    const refresh = () => { if (document.visibilityState === 'visible') void this.refresh(); };
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { this.stopped = true; this.controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }
}
