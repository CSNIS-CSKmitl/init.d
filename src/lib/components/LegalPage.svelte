<script>
  import { siteName, legalDocuments } from '../legal/content.js';

  let { kind = 'privacy' } = $props();
  let document = $derived(legalDocuments[kind === 'terms' ? 'terms' : 'privacy']);
</script>

<svelte:head>
  <title>{document.title} | {siteName}</title>
  <meta name="description" content={document.intro} />
</svelte:head>

<article class="legal-document" lang="th" aria-labelledby="legal-title">
  <a class="legal-back" href="/">← กลับหน้าหลัก</a>
  <header>
    <p class="legal-site">{siteName}</p>
    <h1 id="legal-title">{document.title}</h1>
    <p class="legal-updated">ปรับปรุงล่าสุด <time datetime="2026-10-11">11 ตุลาคม 2569</time></p>
    <p class="legal-intro">{document.intro}</p>
  </header>

  <nav class="legal-tabs" aria-label="เอกสารเกี่ยวกับการใช้บริการ">
    <a href="/privacy" aria-current={kind === 'privacy' ? 'page' : undefined}>นโยบายความเป็นส่วนตัว</a>
    <a href="/terms" aria-current={kind === 'terms' ? 'page' : undefined}>ข้อกำหนดการใช้งาน</a>
  </nav>

  {#each document.sections as section, index}
    <section aria-labelledby={`legal-section-${index}`}>
      <h2 id={`legal-section-${index}`}>{index + 1}. {section.title}</h2>
      {#each section.paragraphs as paragraph}
        <p>{paragraph}</p>
      {/each}
    </section>
  {/each}

  <aside class="legal-contact" aria-labelledby="legal-contact-title">
    <h2 id="legal-contact-title">ติดต่อผู้ดูแลระบบ</h2>
    <p>ทีมดูแลระบบเครือข่ายและโครงสร้างพื้นฐาน CSNIS · CS KMITL</p>
    <p>สถานที่ติดต่อ: พระจอมเกล้า 713</p>
    <p>กรุณาระบุชื่อบริการ เรื่องที่ต้องการติดต่อ และข้อมูลที่จำเป็นต่อการตรวจสอบ โดยไม่ส่งรหัสผ่านหรือรหัสยืนยันตัวตน</p>
  </aside>
</article>

<style>
  .legal-document {
    width: 100%;
    max-width: 52rem;
    margin: 0 auto;
    padding: clamp(1.25rem, 4vw, 3rem) clamp(1rem, 3vw, 1.75rem);
    color: inherit;
    overflow-wrap: anywhere;
    line-height: 1.9;
  }
  .legal-document h1, .legal-document h2, .legal-document p { margin: 0; }
  .legal-document a { color: inherit; text-underline-offset: 0.25em; }
  .legal-document a:hover { text-decoration: underline; }
  .legal-document a:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; border-radius: 4px; }
  .legal-back { display: inline-block; padding: 0.5rem 0; margin-bottom: 1.5rem; font-size: 0.9rem; text-decoration: underline; }
  .legal-site, .legal-updated { font-size: 0.875rem; }
  .legal-document h1 { margin: 0.5rem 0 0.75rem; font-size: clamp(1.75rem, 5vw, 2.5rem); line-height: 1.45; font-weight: 700; }
  .legal-intro { margin-top: 1.5rem !important; }
  .legal-tabs { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin: 2rem 0; padding: 0.75rem 0; border-block: 1px solid var(--border, var(--color-strong-app, #d9dedb)); }
  .legal-tabs a { display: inline-flex; align-items: center; min-height: 2.75rem; font-size: 0.95rem; }
  .legal-tabs a[aria-current="page"] { font-weight: 700; text-decoration: underline; }
  .legal-document section { margin-top: 1.75rem; }
  .legal-document h2 { margin-bottom: 0.65rem; font-size: 1.125rem; line-height: 1.65; font-weight: 600; }
  .legal-document section p + p { margin-top: 0.75rem; }
  .legal-contact { margin-top: 2.5rem; padding: 1.25rem; border: 1px solid var(--border, var(--color-strong-app, #d9dedb)); border-radius: 0.75rem; font-size: 0.95rem; }
  .legal-contact p + p { margin-top: 0.5rem; }
</style>
