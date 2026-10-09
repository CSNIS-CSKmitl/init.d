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

## Deploy ผ่าน GitHub Actions และ PM2

ใช้ [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): push เข้า `main` หรือกด Run workflow เพื่อให้ runner ตรวจและ build แล้วส่งไฟล์ด้วย rsync ผ่าน SSH ไปยัง Linux server และ restart PM2 (สร้าง process หากยังไม่มี) หลังจากนั้นตรวจ HTTP `/login` ก่อน `pm2 save`

ตั้งค่าใน GitHub → Settings → Secrets and variables → Actions:

| ประเภท | ชื่อ | ค่า |
| --- | --- | --- |
| Secret | `SSH_HOST` | IP หรือ hostname ของ server |
| Secret | `SSH_USER` | user SSH ที่เป็นเจ้าของ process PM2 และเขียนไฟล์ปลายทางได้ |
| Variable | `DEPLOY_PATH` | absolute path ของแอป เช่น `/var/www/initd` (ไม่ใช้ช่องว่างหรือ `..`) |
| Variable (optional) | `VITE_POCKETBASE_URL` | ค่าเริ่มต้น `/api/db` ผ่าน proxy ของเว็บ ไม่ต้องตั้งซ้ำ; ตั้งเฉพาะเมื่อต้องการใช้ URL อื่นตอน build |
| Variable | `PM2_APP_NAME` | ชื่อ process PM2 เดิม; ค่าเริ่มต้น `initd` |

เตรียม server ครั้งแรก: สร้าง `DEPLOY_PATH` ให้ SSH user เขียนได้, ติดตั้ง Node.js **24**, npm, rsync และ PM2 และให้คำสั่งเหล่านี้อยู่ใน PATH ของ SSH แบบ non-interactive ก่อนรัน workflow สร้าง `.env` ใน path นี้ตาม `.env.example` โดยต้องมี `ORIGIN` และค่า production อื่น ๆ ให้ครบ หากมี process PM2 อยู่แล้ว ต้องใช้ `server.js` และ working directory ตรงกับ `DEPLOY_PATH`

เก็บ production `.env` ไว้บน server ที่เดียว ไม่ต้องคัดลอก env ทั้งชุดไป GitHub และไม่ต้องใส่ใหม่ทุกครั้งที่ deploy ค่า `POCKETBASE_URL` ในไฟล์นี้ใช้ URL ภายในที่ server เข้าถึงได้ ส่วน browser ใช้ `/api/db` ที่ฝังตอน build เพื่อให้เว็บ proxy ต่อไป PocketBase การเปลี่ยน `POCKETBASE_URL` ใช้ restart PM2 เพื่อโหลดค่าใหม่; หากเปลี่ยน `VITE_POCKETBASE_URL` ต้อง build/deploy ใหม่ เพราะเป็นค่าที่ฝังในไฟล์ client

ใช้ self-hosted Linux runner ที่ตั้งค่า SSH ไปยัง server ไว้แล้ว Workflow ใช้ SSH config, key หรือ agent และ known_hosts ของ user ที่รัน runner โดยตรง จึงไม่ต้องตั้ง `SSH_PRIVATE_KEY` หรือ `SSH_KNOWN_HOSTS` ใน GitHub ใช้ SSH port 22 ตามปกติ ทดสอบ `ssh -o BatchMode=yes <user>@<host> true` ด้วย user เดียวกับ service ของ runner ให้ผ่านก่อน ถ้ามีหลาย Linux runners ให้เพิ่ม label ของ runner ที่มี SSH access ใน `runs-on` ของ workflow

runner ต้องมี SSH และ rsync เช่นกัน Workflow ส่งเฉพาะ build และไฟล์ runtime ที่ `server.js` ใช้ เก็บ `.env` กับ `.data` เดิมบน server ไว้ และไม่รัน PocketBase migrations อัตโนมัติ การอัปเดตไฟล์และติดตั้ง dependency ทำใน path เดิม จึงอาจมี downtime ช่วง deploy และไม่มี rollback อัตโนมัติ ตั้ง `pm2 startup` บน server ครั้งแรกหากต้องการให้ process กลับมาหลัง reboot

## หน้าหลัก

| หน้า | งาน |
| --- | --- |
| `/login` | เข้าเว็บผ่าน PocketBase `oidc` หรือบัญชี `users` |
| `/request` | ขอ VM/CT และระบุเจ้าของร่วมก่อนส่ง |
| `/status` | ดูคำขอ, เพิ่ม/ลบเจ้าของร่วม, แก้หรือยกเลิกคำขอ pending; กดแถวเครื่องเพื่อดูกราฟ CPU/RAM/Network และจัดการ Power/Console/SSH |
| `/admin` | ดูคิว, ตอบผู้ขอ, แก้ข้อมูลและ IP, Complete ด้วยตนเองหรือ Auto Provision, ลบ VM/CT |

Popup “มีอะไรใหม่” หลังล็อกอินแก้ข้อความและเปิด/ปิดได้ใน [`src/lib/whats-new.ts`](src/lib/whats-new.ts) รายละเอียดอยู่ใน [คู่มือส่งต่อ](docs/HANDOVER_TH.md#ประกาศอัปเดตหลังล็อกอิน)

ประกาศกลางจัดการในโปรเจกต์ `../Announcements` โดย admin หรือ superadmin ใช้ collection `announcements` ใน PocketBase เดียวกัน เลือกปลายทาง `all` หรือ `initd` เพื่อแสดงในเว็บนี้ ผู้เข้าชมเห็นป๊อปอัปได้โดยไม่ต้องล็อกอิน และแสดงใหม่ทุกครั้งที่เปิดหรือรีโหลดเว็บ ปิดแล้วไม่เด้งซ้ำในการเปิดเว็บครั้งนั้น ยกเว้นมีประกาศใหม่หรือแก้ไขประกาศ ระบบตรวจทุก 30 วินาทีเมื่อแท็บเปิดอยู่ และเปิดอ่านซ้ำได้จากปุ่ม “ประกาศ” บนแถบเมนู

API `/api/announcements` ส่งเฉพาะข้อมูลสาธารณะของประกาศที่เผยแพร่และอยู่ในช่วงเวลาแสดงผล ไม่ cache ผลลัพธ์ ข้อความแสดงเป็นข้อความธรรมดา ลิงก์อนุญาตเฉพาะ HTTP/HTTPS หากยังไม่ติดตั้ง collection หรือโหลดครั้งแรกไม่ได้ จะใช้ประกาศน้ำท่วมใน [`src/lib/flood-announcement.ts`](src/lib/flood-announcement.ts) เป็นสำรอง (`enabled: false` ปิดสำรองได้) การเปิดเว็บครั้งที่มีประกาศกลางจะแสดงป๊อปอัปประกาศก่อน และไม่เปิดป๊อปอัป “มีอะไรใหม่” ซ้อนกัน

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

อัปเกรด state ของระบบ provisioning บนฐานข้อมูลเดิม:

```sh
node scripts/add-instance-state.mjs          # ตรวจ schema ก่อน
node scripts/add-instance-state.mjs --apply  # สำรอง schema ใน .data แล้วอัปเดต
```

สคริปต์เพิ่ม `failed` และ `deleted` ใน `status` และเติม `provision_state`, `provision_error`, `IP`, `vmid`, `node`, `datedelete` ที่ยังขาด โดยเก็บ field ID, relation และ API rules เดิมไว้ มี migration `pb_migrations/1791320000_instance_provision_state.js` และ `pb_migrations/1791321000_soft_delete_instances.js` สำหรับ PocketBase ที่ใช้ CLI migrations

Auto บันทึก `provisioning` ก่อนเริ่มงาน, `completed` เมื่อสำเร็จ และ `failed` พร้อม error เมื่อมีปัญหา จึงยังเห็นผลหลังรีเฟรชหรือ restart เว็บ VMID/Node ถูกบันทึกก่อนเริ่ม clone เพื่อจัดการ VM ที่สร้างค้างได้ หาก VMID มีอยู่แล้วจะไม่สร้างซ้ำ การ retry เมื่อยังมี VM ค้างต้องตรวจและลบเครื่องเดิมหรือ Complete แบบ Manual ก่อน

หน้า admin แก้ IP ใน Edit lease fields ได้ (IPv4/IPv6 หรือเว้นว่างเพื่อล้าง) เป็นการแก้ค่าในฐานข้อมูลและปลายทาง SSH ต้องตั้ง network ภายใน guest แยกเมื่อเปลี่ยน IP จริง ปุ่ม Delete VM / CT ต้องพิมพ์ hostname เพื่อยืนยัน ระบบหาโหนดปัจจุบันจาก Proxmox, ตรวจชนิด/hostname และไม่อนุญาตลบ template จากนั้นหยุดเครื่องและรอ task ลบสำเร็จ แล้วเก็บรายการเดิมใน PocketBase เป็นประวัติ โดยตั้ง `status` และ `provision_state` เป็น `deleted`, ล้าง `vmid`/`node` และบันทึกวันเวลาที่ลบใน `datedelete` (เก็บ UTC แสดงเวลาไทย) ข้อมูลคำขอและ IP เดิมยังอยู่ หากลบล้มเหลวจะเก็บ VMID/Node และ error ไว้ให้ admin ลองลบใหม่ รายการที่ลบแล้วแสดงในตัวกรอง Deleted และไม่สามารถแก้ข้อมูลเครื่องหรือ provision ซ้ำได้ การกดลบซ้ำไม่เปลี่ยนวันที่ลบเดิม

## ตรวจงาน

```sh
npm run check
npm run build
node scripts/test-sync-instance-nodes.mjs
node --test scripts/test-instance-lifecycle.mjs scripts/test-admin-instances.mjs
```

การทดสอบที่ใช้ PocketBase/Proxmox จริงและบัญชีทดสอบอยู่ใน [คู่มือส่งต่อ](docs/HANDOVER_TH.md#สคริปต์และการทดสอบ)

## OAuth2 และเงื่อนไข Computer Science

หน้า Login ใช้ PocketBase `oidc` โดยตรงและยังไม่ได้ขอ IAM scope เพิ่ม โค้ด PocketBase auth hook สำหรับตรวจสาขาอยู่ใน `pb_hooks/` แต่ยังไม่ยืนยันว่าติดตั้งบนเซิร์ฟเวอร์ PocketBase จึงยังถือว่าเงื่อนไข Computer Science ไม่ถูกบังคับที่ฐานข้อมูล รายละเอียดการตั้ง scope, การตรวจ claim และขั้นตอนเปิดใช้ hook อยู่ใน [คู่มือส่งต่อ](docs/HANDOVER_TH.md#oauth2-ของ-pocketbase-และ-iam-scopes)
