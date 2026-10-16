<script lang="ts">
  let { userId = null, enabled = true, onAccepted }: { userId?: string | null; enabled?: boolean; onAccepted?: () => void } = $props();
  let open = $state(false); let confirmed = $state(false);
  const serviceKey = 'initd:legal-consent:v1';
  let storageKey = $derived(`${serviceKey}:${userId ?? 'anonymous'}`);
  $effect(() => { if (typeof localStorage !== 'undefined') { open = enabled && Boolean(userId) && localStorage.getItem(storageKey) !== 'accepted'; confirmed = false; } });
  function accept() { if (!confirmed) return; localStorage.setItem(storageKey, 'accepted'); open = false; onAccepted?.(); }
</script>

{#if open}
  <div class="consent-backdrop" role="presentation">
    <dialog open class="consent-dialog" aria-labelledby="consent-title">
      <p class="consent-kicker">ก่อนเริ่มใช้งาน</p>
      <h2 id="consent-title">กรุณาอ่านและยอมรับเอกสารของบริการ</h2>
      <p class="consent-copy">เพื่อให้บริการเป็นไปตามข้อกำหนด กรุณาอ่านนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานก่อนดำเนินการต่อ</p>
      <div class="consent-links"><a href="/privacy" target="_blank" rel="noopener noreferrer">นโยบายความเป็นส่วนตัว ↗</a><a href="/terms" target="_blank" rel="noopener noreferrer">ข้อกำหนดการใช้งาน ↗</a></div>
      <label class="consent-check"><input type="checkbox" bind:checked={confirmed} /> <span>ฉันได้อ่านและยอมรับเอกสารทั้งสองฉบับ</span></label>
      <button class="consent-button" disabled={!confirmed} onclick={accept}>ยอมรับและเริ่มใช้งาน</button>
    </dialog>
  </div>
{/if}

<style>
  .consent-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 1rem; background: rgb(0 0 0 / .68); }
  .consent-dialog { position: relative; inset: auto; margin: 0; width: min(100%, 30rem); max-width: 30rem; max-height: calc(100dvh - 1.5rem); overflow-y: auto; border: 1px solid var(--border); border-radius: 1rem; background: var(--card); color: var(--foreground); padding:clamp(1rem,4vw,1.5rem); box-shadow: 0 1.5rem 4rem rgb(0 0 0 / .35); }
  .consent-kicker { margin: 0 0 .4rem; color: var(--muted-foreground); font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  h2 { margin: 0; font-size: 1.15rem; } .consent-copy { margin: .75rem 0 1rem; color: var(--muted-foreground); font-size: .9rem; line-height: 1.6; }
  .consent-links { display: flex; flex-wrap: wrap; gap: .75rem 1.25rem; margin-bottom: 1.1rem; } a { color: var(--primary); font-size: .85rem; text-decoration: underline; text-underline-offset: 3px; }
  .consent-check { display:flex; gap:.55rem; align-items:flex-start; font-size:.85rem; line-height:1.45; cursor:pointer } input { appearance:none; width:1.1rem; height:1.1rem; flex:0 0 1.1rem; margin:.15rem 0 0; border:2px solid var(--primary); border-radius:.25rem; background:var(--card); display:grid; place-content:center } input::before { content:"✓"; font-size:.8rem; font-weight:800; color:var(--primary-foreground); transform:scale(0) } input:checked { background:var(--primary) } input:checked::before { transform:scale(1) }
  .consent-button { width: 100%; margin-top: 1.25rem; border: 0; border-radius: .65rem; padding: .7rem 1rem; background: var(--primary); color: var(--primary-foreground); font-weight: 700; cursor: pointer; } .consent-button:disabled { cursor: not-allowed; opacity: .45; }
</style>
