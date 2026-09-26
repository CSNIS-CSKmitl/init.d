<script lang="ts">
  import { onMount } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Spinner } from '$lib/components/ui/spinner';
  import { Megaphone, ExternalLink, ChevronLeft, ChevronRight } from '@lucide/svelte';
  import { AnnouncementFeed } from '$lib/announcement-feed.svelte';
  import { announcementPriorityLabels, announcementLink } from '$lib/announcements';
  import { floodAnnouncement as legacy } from '$lib/flood-announcement';
  let { open = $bindable(false), onInitialCheck, userId: _userId }: {
    open?: boolean; onInitialCheck?: (unseen: boolean) => void; userId?: string | null;
  } = $props();
  const fallback = legacy.enabled ? { id: 'legacy-flood', title: legacy.title, body: `${legacy.description}\n\n${legacy.instruction}\n“${legacy.message}”`, priority: 'emergency' as const, revision: legacy.version, link_label: 'ไปที่ SOS KMITL', link_url: legacy.helpUrl, source_url: legacy.sourceUrl, start_at: '', end_at: '' } : null;
  const feed = new AnnouncementFeed(fallback, unseen => { onInitialCheck?.(unseen); if (unseen) open = true; }, () => { open = false; });
  onMount(() => feed.start());
  $effect(() => { feed.isOpen = open; if (open && !feed.selected && feed.items.length) feed.selected = feed.items[0]; });
  function dismiss() { feed.markRead(); open = false; }
  function acknowledge() { if (!feed.nextUnread()) open = false; }
</script>
<Dialog.Root bind:open onOpenChange={(nextOpen) => { if (!nextOpen) feed.markRead(); }}>
  <Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <div class="mb-2 flex items-center gap-2"><Megaphone aria-hidden="true" class="size-5 text-primary" /><Badge variant={feed.selected?.priority === 'emergency' ? 'destructive' : 'secondary'}>{feed.selected ? announcementPriorityLabels[feed.selected.priority] : 'ประกาศ'}</Badge></div>
      <Dialog.Title>{feed.selected?.title || (feed.loaded ? 'ยังไม่มีประกาศในขณะนี้' : 'กำลังโหลดประกาศ')}</Dialog.Title>
      <Dialog.Description class="whitespace-pre-wrap break-words leading-relaxed">{feed.selected?.body || (feed.loaded ? 'ประกาศใหม่จะแสดงเมื่อเผยแพร่จากศูนย์ประกาศกลาง' : 'กรุณารอสักครู่')}</Dialog.Description>
    </Dialog.Header>
    {#if !feed.loaded}<Spinner class="mx-auto" />{/if}
    {#if feed.selected}
      {#if announcementLink(feed.selected.link_url)}<Button href={announcementLink(feed.selected.link_url)} target="_blank" rel="noopener noreferrer" class="min-h-11 w-full">{feed.selected.link_label || 'เปิดลิงก์'}<ExternalLink aria-hidden="true" data-icon="inline-end" /></Button>{/if}
      {#if announcementLink(feed.selected.source_url)}<Button href={announcementLink(feed.selected.source_url)} target="_blank" rel="noopener noreferrer" variant="outline" class="min-h-11 w-full">อ่านประกาศต้นฉบับ<ExternalLink aria-hidden="true" data-icon="inline-end" /></Button>{/if}
    {/if}
    <Dialog.Footer class="flex-col gap-3 sm:flex-col">
      {#if feed.items.length > 1}<div class="flex items-center justify-between gap-3"><Button variant="outline" class="min-h-11 min-w-11" aria-label="ประกาศก่อนหน้า" onclick={() => feed.select(-1)}><ChevronLeft /></Button><p class="text-xs text-muted-foreground">ประกาศ {feed.items.findIndex(item => item.id === feed.selected?.id) + 1} / {feed.items.length}</p><Button variant="outline" class="min-h-11 min-w-11" aria-label="ประกาศถัดไป" onclick={() => feed.select(1)}><ChevronRight /></Button></div>{/if}
      <Button type="button" variant="secondary" onclick={feed.selected ? acknowledge : dismiss} class="min-h-11 w-full">{feed.selected ? 'รับทราบ' : 'ปิด'}</Button>
      <p class="text-center text-xs leading-relaxed text-muted-foreground">ประกาศจะแสดงอีกครั้งเมื่อเปิดหรือรีโหลดเว็บ</p>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
