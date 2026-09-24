# init.d

เว็บรับคำขอ VM และ LXC container ของ CS KMITL ใช้ SvelteKit, PocketBase และ Proxmox VE ชื่อเดิมในบางไฟล์คือ LEASE

**คู่มือส่งต่อฉบับเต็ม:** [docs/HANDOVER_TH.md](docs/HANDOVER_TH.md) — วิธีใช้สำหรับผู้ขอและแอดมิน, การติดตั้ง, ฐานข้อมูล/migration, Proxmox, node sync, การทดสอบ และการแก้ปัญหา

## เริ่มต้น

ต้องมี Node.js/npm, PocketBase และ Proxmox ที่เข้าถึงได้จากเครื่องเว็บ ตั้งค่าจริงใน `.env` ตาม [.env.example](.env.example) โดยไม่ commit credential

```sh
npm ci
npm run dev
```

สำหรับ production:

```sh
npm run check
npm run build
npm run start
```

กำหนด `PORT` และ `ORIGIN` ให้ตรง public URL ของ production server และตั้ง reverse proxy ให้รองรับ WebSocket `/ssh-ws` กับ `/proxmox-ws`

## หน้าหลัก

| หน้า | งาน |
| --- | --- |
| `/login` | เข้าเว็บผ่าน PocketBase `oidc` หรือบัญชี `users` |
| `/request` | ขอ VM/CT และระบุเจ้าของร่วมก่อนส่ง |
| `/status` | ดูคำขอ, เพิ่ม/ลบเจ้าของร่วม, แก้หรือยกเลิกคำขอ pending; กดแถวเครื่องเพื่อดูกราฟ CPU/RAM/Network และจัดการ Power/Console/SSH |
| `/admin` | ดูคิว, ตอบผู้ขอ, แก้ข้อมูล, Complete ด้วยตนเองหรือ Auto Provision |

Popup “มีอะไรใหม่” หลังล็อกอินแก้ข้อความและเปิด/ปิดได้ใน [`src/lib/whats-new.ts`](src/lib/whats-new.ts) รายละเอียดอยู่ใน [คู่มือส่งต่อ](docs/HANDOVER_TH.md#ประกาศอัปเดตหลังล็อกอิน)

## Node sync

เว็บ dev และ production จะตรวจ Proxmox เป็นรอบ (ค่าเริ่มต้น 60 วินาที ปรับได้ด้วย `NODE_SYNC_INTERVAL_SECONDS`) แล้วอัปเดต `instances.node` เมื่อ VM/CT ย้ายโหนด โดยจับคู่จากชนิด guest กับ VMID/CTID

```sh
npm run sync:nodes             # ดูผลก่อน
npm run sync:nodes -- --apply  # ซิงก์หนึ่งครั้ง
npm run sync:nodes:watch       # worker แยก
```

ตั้ง `NODE_SYNC_ENABLED=false` เพื่อปิด loop ในเว็บ หรือกำหนด `NODE_SYNC_INTERVAL_SECONDS` เป็น 30–3600 ดูรายละเอียดและกรณี `SKIPPED` ในคู่มือส่งต่อ

## ฐานข้อมูลและ migration

ฐานข้อมูลปัจจุบันใช้ `instances.email` เป็น relation ไป `users`, `owners` เป็น relation เจ้าของร่วม และ `node` เป็น number ส่วน `pb_migrations/1700000000_create_instances.js` กับ `scripts/setup-instances.mjs` ยังเป็น schema รุ่นเก่า (`creator_email`) จึงไม่ใช่ขั้นตอนติดตั้งฐานข้อมูลใหม่ที่สมบูรณ์ ให้ backup/restore PocketBase schema ปัจจุบัน หรือสร้าง migration ใหม่ตาม [คู่มือ](docs/HANDOVER_TH.md#การย้ายฐานข้อมูลและ-migration) ก่อนเปิดเว็บ

อัปเกรดฐานข้อมูลเดิมที่ยังไม่มี `owners` ใช้ `node scripts/add-instance-owners.mjs` หลัง backup และตรวจ schema ส่วน `scripts/patch-instances.mjs` เติมบางฟิลด์ของรุ่นเก่าเท่านั้น และอาจสร้าง `node` เป็น text หากไม่มีฟิลด์นี้

## ตรวจงาน

```sh
npm run check
npm run build
node scripts/test-sync-instance-nodes.mjs
```

การทดสอบที่ใช้ PocketBase/Proxmox จริงและบัญชีทดสอบอยู่ใน [คู่มือส่งต่อ](docs/HANDOVER_TH.md#สคริปต์และการทดสอบ)

## OAuth2 และเงื่อนไข Computer Science

หน้า Login ใช้ PocketBase `oidc` โดยตรงและยังไม่ได้ขอ IAM scope เพิ่ม โค้ด PocketBase auth hook สำหรับตรวจสาขาอยู่ใน `pb_hooks/` แต่ยังไม่ยืนยันว่าติดตั้งบนเซิร์ฟเวอร์ PocketBase จึงยังถือว่าเงื่อนไข Computer Science ไม่ถูกบังคับที่ฐานข้อมูล รายละเอียดการตั้ง scope, การตรวจ claim และขั้นตอนเปิดใช้ hook อยู่ใน [คู่มือส่งต่อ](docs/HANDOVER_TH.md#oauth2-ของ-pocketbase-และ-iam-scopes)
