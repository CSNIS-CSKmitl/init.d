# คู่มือส่งต่อระบบ init.d

ปรับตามโค้ด ณ 24 กันยายน 2026 และโครงสร้าง PocketBase ที่ตรวจได้ก่อนหน้านี้ คู่มือนี้ใช้สำหรับผู้ขอ VM/CT ผู้ดูแลคิว และผู้รับช่วงดูแลระบบ สถานะการติดตั้งบนเครื่อง PocketBase ระบุแยกจากไฟล์ที่เตรียมไว้ใน repository ค่าบัญชี รหัสผ่าน token และ URL ภายในให้รับจากผู้ดูแลผ่านช่องทางที่ปลอดภัย ไม่บันทึกลง Git หรือเอกสารนี้

## สารบัญ

1. [ระบบทำงานอย่างไร](#ระบบทำงานอย่างไร)
2. [เริ่มใช้งานและตั้งค่า](#เริ่มใช้งานและตั้งค่า)
3. [คู่มือผู้ขอและเจ้าของร่วม](#คู่มือผู้ขอและเจ้าของร่วม)
4. [คู่มือแอดมิน](#คู่มือแอดมิน)
5. [ประกาศอัปเดตหลังล็อกอิน](#ประกาศอัปเดตหลังล็อกอิน)
6. [ข้อมูลใน PocketBase และสิทธิ์](#ข้อมูลใน-pocketbase-และสิทธิ์)
7. [การย้ายฐานข้อมูลและ migration](#การย้ายฐานข้อมูลและ-migration)
8. [การเชื่อมต่อ Proxmox และซิงก์โหนด](#การเชื่อมต่อ-proxmox-และซิงก์โหนด)
9. [สคริปต์และการทดสอบ](#สคริปต์และการทดสอบ)
10. [แก้ปัญหาที่พบบ่อย](#แก้ปัญหาที่พบบ่อย)
11. [รายการส่งมอบให้รุ่นถัดไป](#รายการส่งมอบให้รุ่นถัดไป)

## ระบบทำงานอย่างไร

init.d เป็นเว็บรับคำขอ VM และ LXC container (CT) มี SvelteKit เป็นเว็บและ API, PocketBase เก็บผู้ใช้/คำขอ, Proxmox VE จัดการ guest, และ Discord webhook สำหรับแจ้งเหตุการณ์ ระบบมีสองวิธีอนุมัติคำขอ: แอดมินสร้าง guest เองแล้วกด Complete หรือให้เว็บ provision ผ่าน Proxmox API

```text
เบราว์เซอร์ ── SvelteKit ── PocketBase (users, instances, templates)
     │             │
     │             ├── Proxmox API (สร้าง, เปิด/ปิด, console, ค้นหาโหนด)
     │             ├── WebSocket proxy (SSH / Proxmox console)
     │             └── Discord webhook (แจ้งเหตุการณ์)
     └── PocketBase realtime (รายการคำขอเปลี่ยนทันที)
```

จุดเริ่มอ่านโค้ด: `src/routes/` คือหน้าและ API, `src/lib/proxmox.ts` คือ provisioning/console, `src/lib/server/instance-owners.ts` คือสิทธิ์เจ้าของ, `server.js` คือ production server และ WebSocket, `vite.config.ts` คือ dev server และ WebSocket, `scripts/` คือเครื่องมือดูแลฐานข้อมูล

## เริ่มใช้งานและตั้งค่า

### สิ่งที่ต้องมี

- Node.js และ npm ที่ติดตั้ง dependency จาก `package-lock.json` ได้
- PocketBase ที่เว็บเซิร์ฟเวอร์เข้าถึงได้ และ URL ที่เบราว์เซอร์เข้าถึงได้สำหรับ OAuth/realtime
- Proxmox VE cluster, API token ที่มีสิทธิ์ตามงาน, และ network จากเว็บเซิร์ฟเวอร์ไป Proxmox
- บัญชี PocketBase superuser สำหรับงาน schema/งานเซิร์ฟเวอร์ แยกจากบัญชีแอดมินที่ใช้ล็อกอินเว็บ

บน PowerShell ในโฟลเดอร์โปรเจกต์:

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

แก้ `.env` ก่อนรัน และเก็บไฟล์นี้ไว้เฉพาะเครื่องเซิร์ฟเวอร์ (`.gitignore` ไม่ให้ commit) หาก `npm` ผ่าน PowerShell shim ไม่ได้ ให้ใช้ Node เรียก npm CLI ที่ติดตั้งอยู่ หรือแก้ PATH ของเครื่องนั้น

### ตัวแปรแวดล้อม

| ตัวแปร | หน้าที่ |
| --- | --- |
| `POCKETBASE_URL` | URL ที่ฝั่ง SvelteKit/สคริปต์ใช้ต่อ PocketBase |
| `VITE_POCKETBASE_URL` | URL ที่เบราว์เซอร์ใช้ต่อ PocketBase โดยตรง ต้องเป็น URL ที่ OAuth redirect และ realtime เข้าถึงได้ |
| `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` | PocketBase superuser สำหรับงานหลังบ้านและสคริปต์ |
| `PROXMOX_HOST`, `PROXMOX_PORT` | Proxmox API host และพอร์ต (ปกติ 8006) |
| `PROXMOX_USER`, `PROXMOX_TOKEN`, `PROXMOX_TOKEN_SECRET` | Proxmox API token สำหรับ inventory, power, provisioning และ console |
| `PROXMOX_PASSWORD` | รหัสผ่านบัญชี Proxmox สำหรับออก console session ticket หาก token อย่างเดียวใช้ console ไม่ได้; แยกจากรหัส SSH ของ guest |
| `PROXMOX_SKIP_TLS_VERIFY` | `true` เมื่อ Proxmox ใช้ certificate ที่เครื่องนี้ตรวจไม่ได้; ควรใช้ certificate ที่เชื่อถือได้เมื่อพร้อม |
| `TEMPLATE_NODE` | ชื่อ node ที่เก็บ base VM/CT template เช่น `pve6` |
| `NODE_SYNC_ENABLED` | `false` เพื่อปิดตัวซิงก์โหนดที่ติดมากับ dev/production server; ค่าอื่นเปิด |
| `NODE_SYNC_INTERVAL_SECONDS` | รอบซิงก์โหนด 30–3600 วินาที; ค่าเริ่มต้น 60 |
| `DISCORD_WEBHOOK_URL` | Webhook แจ้งสร้างคำขอ/เริ่ม provision/สำเร็จ/ล้มเหลว; ไม่ตั้งค่าแล้วเว็บยังทำงาน |
| `DISCORD_LINK` | ลิงก์ Discord Support ในหน้าเว็บ |
| `CONSOLE_GRANT_SECRET` | คีย์เซ็นสิทธิ์ console WebSocket อายุ 60 วินาที; ถ้าไม่ตั้งจะใช้ `PROXMOX_TOKEN_SECRET` |
| `SSH_HOST_KEYS_FILE` | ที่เก็บ fingerprint ของ SSH host key; ค่าเริ่มต้น `.data/ssh-hostkeys.json` ต้องเก็บข้ามการ deploy |
| `PORT`, `ORIGIN` | พอร์ตและ public origin ของ adapter-node; production ต้องตั้ง `ORIGIN` ให้ตรง URL ที่เบราว์เซอร์เปิด |

### OAuth2 ของ PocketBase และ IAM scopes

หน้า Login เรียก `pb.collection('users').authWithOAuth2({ provider: 'oidc' })` โดยตรง PocketBase จัดการ redirect, แลก OAuth code และสร้าง/ผูกบัญชี `users` เอง ฝั่ง SvelteKit ไม่ทำ OAuth flow ใหม่และไม่สร้างบัญชีเอง มีทางเข้าด้วย username/email + password ของ collection `users` ด้วย ปุ่ม OAuth ระบุ KMITL IAM สคริปต์ `setup-google-oauth.mjs` จัดการ provider ชื่อ `google` ซึ่งเป็นเส้นทางเก่า ไม่ได้ตั้งค่า `oidc` ให้หน้า Login ปัจจุบัน

หลัง PocketBase ทำ OAuth สำเร็จ เว็บส่ง PocketBase token ไป `/auth/oidc` เพื่อให้เซิร์ฟเวอร์เรียก `users.authRefresh()` ยืนยัน token กับ PocketBase และตรวจว่า record ID ตรงกัน แล้วเก็บใน HttpOnly cookie เว็บไม่เรียก IAM `userinfo` เองและไม่รับ role/major จากเบราว์เซอร์ หากยังไม่มี `user_type` เซิร์ฟเวอร์กำหนด relation นักศึกษาเริ่มต้นสำหรับบัญชี OAuth ใหม่ **หลัง PocketBase ยืนยัน token เท่านั้น**; relation นี้ไม่ใช่หลักฐานว่า IAM ยืนยันสาขาแล้ว

โค้ดปัจจุบัน **ไม่ได้ส่ง custom `scopes`** ใน `authWithOAuth2` จึงใช้ค่าเริ่มต้นของ PocketBase OIDC (`openid`, `email`, `profile`) หาก IAM ต้องการ scope เพิ่มเพื่อส่ง `role` หรือสาขา ให้ขอชื่อ scope ที่ถูกต้องจากผู้ดูแล IAM ก่อน แล้วเพิ่มที่ `src/routes/login/+page.svelte` เช่น `authWithOAuth2({ provider: 'oidc', scopes: ['openid', 'email', 'profile', '<IAM scope>'] })` พร้อมขยายชนิด `authWithOAuth2` ใน `src/lib/pb/client.ts` ด้วย การส่ง `scopes` จะ **แทน** ค่าเริ่มต้น จึงต้องคง scope เดิมที่ยังใช้ไว้ ค่า client ID/secret และ endpoint ตั้งใน PocketBase Admin UI → `users` → OAuth2 providers ส่วน custom scope ของการล็อกอินนี้ตั้งใน SDK call ไม่ใช่การกำหนดสิทธิ์ของ collection

อ้างอิง: [คู่มือ OAuth2 ของ PocketBase](https://pocketbase.io/docs/authentication/), [คำตอบเรื่อง custom scope จากผู้ดูแล PocketBase](https://github.com/pocketbase/pocketbase/discussions/7114)

Scope เป็นการขอข้อมูลจาก IAM ไม่ใช่เงื่อนไขว่าเป็นนักศึกษา Computer Science หาก `userinfo` ส่ง `role` และสาขาปัจจุบันอยู่แล้ว ไม่ต้องเพิ่ม scope หากยังไม่ส่ง ต้องตรวจเอกสาร IAM หรือตัวอย่าง UserInfo ที่ปิดข้อมูลส่วนตัวก่อนเลือก scope และ path ของ claim; **ยังไม่มีตัวอย่าง `StudentProfile` จริงที่ยืนยัน path ของสาขา**

PocketBase เป็นตัวเก็บบัญชีและ relation `user_type`; IAM เป็นแหล่งยืนยันสถานะนักศึกษาและสาขา การบังคับ Computer Science ต้องทำใน PocketBase auth hook บนเครื่อง PocketBase เอง เพราะ PocketBase เป็นผู้ออก token และเปิด API ให้ใช้งานโดยตรง ไม่ควรพึ่งการตรวจที่เว็บหลัง PocketBase ออก token แล้ว **ณ วันที่ปรับคู่มือนี้ hook ยังเป็นเพียงไฟล์ใน repository ไม่ได้ยืนยันว่าติดตั้งบนเซิร์ฟเวอร์ PocketBase; จึงยังถือว่าไม่ได้บังคับ CS ที่ PocketBase**

ไฟล์ `pb_hooks/iam-oidc-eligibility.pb.js` เตรียมไว้สำหรับ PocketBase ที่รันจริง โดยต้องวางใน `pb_hooks` ของ process PocketBase (ไม่ใช่โฟลเดอร์เว็บ) Hook `onRecordAuthWithOAuth2Request` ตรวจข้อมูลที่ IAM ส่งหลังแลก token และก่อน PocketBase สร้าง/ผูกบัญชีหรือออก auth token: provider ต้องเป็น `oidc`, UserInfo URL ต้องตรง IAM, `sub` ต้องตรง OAuth identity, `role` ต้องเป็น `student` และ `profile` ต้องระบุสาขา Computer Science ปัจจุบัน หากข้อมูลขาดหรือไม่ตรงจะปฏิเสธ ค่าเริ่มต้นปฏิเสธ OAuth provider อื่นรวมถึง Google และบทบาท IAM ที่ไม่ใช่นักศึกษา; หากองค์กรอนุมัติข้อยกเว้นสำหรับ `teacher` หรือ `staff` จึงค่อยตั้ง `IAM_OIDC_ALLOWED_NON_STUDENT_ROLES` ใน environment ของ **PocketBase** เป็นรายการคั่นด้วยจุลภาค หลังตรวจผลกระทบกับทุกโครงการแล้ว การแก้ `.env` ของเว็บไม่มีผลต่อ environment ของ PocketBase

อ้างอิงลำดับการทำงานของ hook: [PocketBase JS event hooks](https://pocketbase.io/docs/js-event-hooks/)

ก่อนติดตั้ง hook ให้ตรวจเวอร์ชัน PocketBase รองรับ event นี้, สำรอง `pb_hooks` เดิม, ตรวจว่ามี hook อื่นทำงานกับ `users` หรือไม่ และยืนยันรูปแบบ `StudentProfile` จริงในฐานทดสอบ จากนั้นทดสอบล็อกอิน IAM ด้วยบัญชี CS ที่ควรผ่านและบัญชีต่างสาขาที่ควรถูกปฏิเสธ ก่อนเปิดใช้ในฐานร่วม ตรวจ log PocketBase ว่าโหลดไฟล์สำเร็จ หากล็อกอินทุกคนล้มเหลว ให้ย้าย hook ออกจาก `pb_hooks` เพื่อย้อนกลับ ห้ามบันทึก access token หรือข้อมูลส่วนตัวลง log การเข้าถึงเครื่อง PocketBase ครั้งแรกผ่าน SSH ควรยืนยัน host-key fingerprint จาก console/ช่องทางที่เชื่อถือได้ก่อนส่งรหัสผ่าน

Hook นี้ควบคุมเฉพาะการล็อกอิน OAuth ครั้งใหม่ บัญชีเดิมที่มี PocketBase token อยู่แล้วอาจใช้ API โดยตรงได้จน token หมดอายุหรือถูกเพิกถอน และการล็อกอินด้วยรหัสผ่านใช้กฎเดิม หากต้องบังคับเงื่อนไข CS กับ token เดิมและทุกวิธีล็อกอิน ให้ทำแผนย้ายบัญชี/เพิกถอน token และออกแบบ policy สำหรับ password/refresh แยก โดยคำนึงว่าฐาน `users` ใช้ร่วมกับหลายโครงการ

ถ้าตั้ง IAM/OIDC ใหม่ ให้เปิด PocketBase Admin UI → `users` → OAuth2 providers แล้วตรวจ provider ชื่อ `oidc`, issuer/authorization/token/userinfo URL, client ID/secret และ redirect URI ที่ PocketBase แสดงให้ตรงฝั่ง IAM จากนั้นตรวจว่า user ที่ล็อกอินมี relation `user_type` ถูกต้อง การให้สิทธิ์แอดมินเว็บทำโดยผูก `users.user_type` เข้ากับ record ใน `user_type` ที่ `type = admin` ไม่ใช่การให้รหัส PocketBase superuser

### Production แบบรันตรง

```powershell
npm run check
npm run build
$env:PORT = '3001'
$env:ORIGIN = 'https://ชื่อโดเมนจริงของเว็บ'
npm run start
```

ให้ reverse proxy รองรับ HTTP และ WebSocket ของ `/ssh-ws` กับ `/proxmox-ws` และใช้ `ORIGIN` ตาม URL ที่ผู้ใช้เปิดจริง ส่วน PocketBase ต้องให้เบราว์เซอร์เข้าถึง URL ใน `VITE_POCKETBASE_URL` ได้ บริการจะทำงานต่อเนื่องได้ก็ต่อเมื่อ process manager ของเครื่องเซิร์ฟเวอร์คง `npm run start` ไว้; repository นี้ไม่มี service/CI deployment manifest ที่เป็นมาตรฐานกลาง

## คู่มือผู้ขอและเจ้าของร่วม

### เข้าสู่ระบบและขอเครื่อง

1. เปิด `/login` แล้วเข้าโดย OAuth หรือบัญชี `users` ที่ได้รับสิทธิ์ เว็บแอดมินกับ PocketBase superuser เป็นคนละบทบาท
2. ไป `/request` เลือก `vm` หรือ `container`, passion group, hostname, OS template, CPU/RAM/Disk, network แบบ local/public, วันเริ่ม/สิ้นสุด และเหตุผลการใช้ ระบุ DNS/ports ตามความต้องการ
3. จะเลือก Quick Preset เพื่อเติมค่าสเปคจาก `templates` ได้ แต่ preset เป็นแค็ตตาล็อกของฟอร์ม ไม่ได้แปลว่า Proxmox มี base template สำหรับ Auto Provision
4. ใส่อีเมลเจ้าของร่วมในช่อง **Co-owner emails** ได้ก่อนส่งคำขอ คั่นด้วย comma, ช่องว่าง หรือ semicolon ได้สูงสุด 10 คน ต้องเป็นบัญชี `users` ที่มีอยู่แล้ว ผู้ขอไม่ต้องใส่อีเมลตัวเอง
5. กดส่ง คำขอจะอยู่สถานะ `pending` และปรากฏใน `/status` การส่งคำขอยังไม่สร้าง guest บน Proxmox

hostname ยอมรับตัวอักษรอังกฤษพิมพ์เล็ก ตัวเลข และ `-` ยาวไม่เกิน 64 ตัว; CPU 1–128 core, RAM 1–1024 GB, disk 1–16384 GB, quantity 1–64, ports เป็นเลข 1–65535 คั่น comma และวันสิ้นสุดต้องไม่ก่อนวันเริ่ม

### ติดตาม/แก้คำขอ

- `/status` แสดงคำขอที่ตนเป็นผู้ขอหรือเจ้าของร่วม รวมข้อความตอบกลับจากแอดมิน และอัปเดตผ่าน PocketBase realtime
- หน้า Status ค้นรายการที่ `email = user ID` และ `owners.id ?= user ID` แยกสองคำสั่ง แล้วรวมตาม record ID เพื่อไม่ให้ VM/CT ของผู้ขอหายหลังเพิ่มเจ้าของร่วม หากโหลด PocketBase ไม่ได้ หน้าจะแสดงข้อผิดพลาดแทนการแสดงรายการว่าง
- ผู้ขอแก้รายละเอียดคำขอหรือยกเลิกได้เฉพาะตอน `pending` การยกเลิก **ลบ record** ใน PocketBase
- ผู้ขอแก้รายชื่อเจ้าของร่วมจากส่วน **Owners → Save owners** ได้ทั้งก่อนและหลังอนุมัติ การบันทึกแทนที่รายชื่อทั้งหมด; ลบอีเมลที่ไม่ต้องการออกก่อนกด Save
- เจ้าของร่วมดูคำขอและเข้าถึงเครื่องได้ แต่แก้คำขอ ยกเลิก หรือจัดการเจ้าของร่วมไม่ได้ ผู้ขอยังคงเป็นเจ้าของหลักในฟิลด์ `email`
- กดตรงไหนก็ได้ในแถวรายการ หรือกด Enter/Space เมื่อโฟกัสแถว เพื่อเปิด popup เดียวที่รวมข้อมูลคำขอและเจ้าของร่วม; บนมือถือแตะการ์ดรายการ ไม่มีแถวรายละเอียดกางใต้ตารางแล้ว
- หน้าต่างจัดการแสดงสถานะปัจจุบัน, โหนดจริง, CPU, RAM, Network, uptime และ disk พร้อมกราฟ CPU/RAM/Network จาก Proxmox RRD เลือกช่วงเวลา 1 ชั่วโมง/วัน/สัปดาห์/เดือน/ปีได้ และรีเฟรชอัตโนมัติทุก 30 วินาที ค่ากราฟอาจยังไม่มีใน guest ที่เพิ่งสร้างหรือถ้า Proxmox RRD ไม่พร้อม
- ในหน้าต่างเดียวกันมี Console และ SSH กับคำสั่ง **Start, Shutdown, Reboot, Force Stop**; VM มี **Pause/Resume, Hibernate และ Reset** เพิ่มเติม Hibernate ใช้ Proxmox `suspend` แบบ `todisk` และต้องมีพื้นที่เก็บ vmstate/สิทธิ์ที่เหมาะสม Shutdown เป็นการปิดแบบปกติ ส่วน Force Stop/Reset อาจทำข้อมูลที่ยังไม่บันทึกสูญหาย ระบบถามยืนยันก่อนคำสั่งที่รบกวนการทำงาน

### Console กับ SSH ต่างกันอย่างไร

- **Console**: ใช้ session ticket จาก Proxmox; VM เปิดจอกราฟิกผ่าน noVNC, CT เปิด terminal ผ่าน termproxy ไม่ต้องใส่รหัส guest ในหน้าต่างเชื่อมต่อ แต่ระบบปฏิบัติการใน guest อาจยังถามล็อกอิน
- **SSH (WebTTY)**: เปิดการเชื่อมต่อ SSH ไป IP/host ของ guest ต้องใช้ username และ password หรือ private key ของ **ระบบปฏิบัติการใน VM/CT** รหัสเว็บไซต์ใช้แทนกันไม่ได้ มีแท็บ SSH พร้อมกันได้สูงสุด 8 session
- ถ้า SSH แจ้ง `All configured authentication methods failed` ให้ตรวจบัญชี/คีย์ใน guest, `sshd`, พอร์ต 22 และนโยบาย `PermitRootLogin` ไม่ใช่รีเซ็ตรหัสเว็บไซต์

API `/api/instance-metrics` และ `/api/instance-power` ตรวจสิทธิ์ผู้ขอ/เจ้าของร่วม/แอดมินก่อนเรียก Proxmox ทุกครั้ง ปุ่มพลังงานใช้ node ปัจจุบันจาก cluster inventory งานที่ส่งไป Proxmox จะตรวจสถานะผ่าน task ID ที่ออกจากคำสั่งของผู้ใช้คนนั้น

## คู่มือแอดมิน

แอดมินเข้าหน้า `/admin` เพื่อดูคิวทั้งหมดและกรอง All/Pending/Provisioning/Failed/Completed เปิดรายละเอียดของแต่ละรายการเพื่อดูสเปค ผู้ขอ เจ้าของร่วม วันใช้งาน เครือข่าย และเหตุผล

1. **Message to requester**: พิมพ์คำตอบแล้ว Send/Update; ใช้ Clear reply เพื่อลบคำตอบ ผู้ขอเห็นที่ `/status`
2. **Edit lease fields**: ปรับ CPU/RAM/Disk, ports, VMID และ node ของ record ค่า node ในฐานข้อมูลเป็นเลข เช่น `4` แทน `pve4` ค่าที่แก้ตรงนี้เป็นข้อมูลคำขอ; ถ้าจะเปลี่ยนสเปค guest ที่มีอยู่ต้องตรวจ Proxmox แยกด้วย
3. **Resolve → Manual**: ใช้เมื่อสร้าง VM/CT บน Proxmox แล้ว กด Complete เพื่อเปลี่ยน `status` เป็น `completed` เท่านั้น ควรกรอก VMID/CTID และ node ให้ตรงก่อน เพื่อให้ปุ่มจัดการเครื่องทำงาน
4. **Resolve → Auto**: กรอก VMID/CTID, หมายเลข node และ storage แล้วกด Provision เว็บจะ clone จาก base template, config, ย้าย node หากจำเป็น, เก็บ IP ถ้าหาได้ และเปลี่ยนสถานะเป็น `completed` เมื่อสำเร็จ ผลคืบหน้าแสดงจาก memory ของ process ที่รันงานอยู่
5. หาก Auto ล้มเหลว ให้ตรวจ guest/task บน Proxmox ก่อนกด Retry เพราะบางขั้นตอนอาจสร้าง guest ไปแล้ว การ retry ด้วย VMID เดิมอาจชนของเดิม

ขั้นตอน Auto Provision ปัจจุบันจะสั่ง shutdown guest หลังตั้งค่าเสร็จ ผู้ใช้จึงต้องกด Start เมื่อต้องการใช้งาน

Auto Provision รองรับเฉพาะ OS template ที่อยู่ใน `static/constant.ts` (`VM_ID` และ `CT_ID`) และ base template ต้องอยู่บน `TEMPLATE_NODE` จริง ตอนนี้ Auto ใช้ `vmbr1` และค่า VLAN/tag ที่เขียนใน `src/lib/proxmox.ts`; ตรวจให้ตรงกับ infrastructure ก่อนใช้งาน การใส่ `quantity` มากกว่า 1 ยังสร้าง **guest เดียวต่อการกด Provision** จึงต้องจัดการจำนวนที่เหลือด้วยขั้นตอนของทีม

## ประกาศอัปเดตหลังล็อกอิน

ผู้ใช้ที่ล็อกอินจะเห็น popup “มีอะไรใหม่” หนึ่งครั้งต่อประกาศในแต่ละเบราว์เซอร์ กดปุ่ม **รับทราบ**, ปุ่ม X, Escape หรือคลิกนอก popup เพื่อปิด เมื่อปิดแล้วระบบจำเวอร์ชันประกาศของบัญชีนั้นใน `localStorage` และจะไม่แสดงซ้ำจนกว่าเวอร์ชันจะเปลี่ยน

แก้ทุกอย่างในไฟล์เดียวคือ `src/lib/whats-new.ts`:

1. แก้ `title`, `intro` และรายการ `items` เพื่อเปลี่ยนข้อความ
2. เปลี่ยน `version` ทุกครั้งที่ต้องการให้ทุกคนเห็นประกาศใหม่ แม้เปลี่ยนเฉพาะข้อความ
3. ตั้ง `enabled: false` เพื่อไม่ให้ popup แสดงกับใครเลย; ตั้งกลับ `true` เพื่อเปิด
4. รัน `npm run check` และ `npm run build` แล้ว restart เว็บ production ตามขั้นตอน deployment

popup ไม่ใช้ PocketBase collection จึงไม่ต้อง migration ฐานข้อมูล การปิดประกาศของผู้ใช้เก็บในเบราว์เซอร์ของผู้ใช้นั้น; เปลี่ยนเครื่อง/ล้าง browser storage จะเห็นประกาศอีกครั้ง

## ข้อมูลใน PocketBase และสิทธิ์

| Collection | ใช้ทำอะไร |
| --- | --- |
| `users` | บัญชีล็อกอินเว็บ; ฟิลด์ `user_type` ชี้ไป `user_type` |
| `user_type` | ชนิดบัญชี; แอดมินของ PocketBase rule ต้องมี `type = admin` |
| `passion_group` | รายชื่อกลุ่มในฟอร์มขอเครื่อง |
| `templates` | Quick Preset ที่เติมค่าในฟอร์ม |
| `instances` | คำขอและข้อมูล VM/CT หลัง provision |

โครงสร้าง `instances` ที่ตรวจจากฐานข้อมูลจริง: `email` เป็น **relation ไป `users` และเก็บ user ID ของผู้ขอ** ไม่ใช่ข้อความอีเมล; `owners` เป็น relation ไป `users` ได้สูงสุด 10 คน; `type` เป็น `vm`/`container`; `status` เป็น `pending`/`completed`; `vmid` เป็น number; `node` เป็น **number** (เช่น `4` คือ `pve4`); `specs` เป็น JSON `{cpu, ram, disk}`; ฟิลด์อื่นที่หน้าเว็บใช้ ได้แก่ `hostname`, `os_template`, `network_type`, `dns_name`, `ports`, `purpose_notes`, `start_date`, `end_date`, `quantity`, `IP`, `admin_reply`, `admin_reply_at`, `provision_state`, `created`, `updated`

กฎ `instances` ปัจจุบัน: ผู้ขอและเจ้าของร่วมอ่านได้, `user_type.type = admin` อ่านได้ทั้งหมด, การสร้าง record ให้ PocketBase superuser เท่านั้น เพราะหน้าเว็บสร้างคำขอผ่านเซิร์ฟเวอร์หลังตรวจฟิลด์แล้ว การแก้/ลบระดับ PocketBase ให้แอดมินเท่านั้น หน้าเว็บจึงตรวจสิทธิ์ก่อนใช้ PocketBase superuser เขียนเจ้าของร่วมและยกเลิกคำขอ อย่าเปิดสิทธิ์สร้างหรือแก้ collection ให้ผู้ใช้ทั่วไปโดยไม่ตรวจ action ฝั่ง server

กฎความปลอดภัยที่ปรับใน PocketBase: `users.create/update` ไม่รับฟิลด์ `user_type` จากผู้ใช้ และ `instances.create` ล็อกให้ PocketBase superuser เท่านั้น วิธีนี้กันผู้ใช้สร้าง record ปลอมพร้อม `status`, `vmid` หรือ `IP` ผ่าน PocketBase API โดยตรง **แต่ไม่ใช่การตรวจ IAM/CS** เพราะ `/auth/oidc` อาจกำหนด `user_type` เริ่มต้นหลัง PocketBase ยืนยัน token `users.list/view` คงกฎเดิม เพราะ PocketBase นี้ใช้ร่วมกับโครงการอื่นที่มี role `superadmin` และ `teachers`; อย่าถอด role เหล่านี้จากกฎฐานข้อมูลร่วมเพียงเพื่อปรับสิทธิ์เว็บ VM/CT สคริปต์ `node scripts/harden-pocketbase-rules.mjs` แสดง dry run และ `node scripts/harden-pocketbase-rules.mjs --apply` ใช้กฎจริงพร้อมสำรองกฎเก่าลง `.data/pocketbase-rules-backup-*.json` ก่อนแก้

เว็บและ WebSocket ให้สิทธิ์แอดมินเฉพาะ `user_type.type = admin` เท่านั้น `superadmin` เป็นบทบาทของอีกโครงการ ไม่ได้เพิ่มสิทธิ์ในเว็บนี้ ส่วน PocketBase superuser ที่เก็บใน `PB_ADMIN_EMAIL` เป็นบัญชีบริการสำหรับงานหลังบ้าน ไม่ใช่ role ของผู้ใช้เว็บ

SSH ในเว็บใช้ IP ของ instance จาก PocketBase และตรวจผู้ขอ/เจ้าของร่วม/แอดมินก่อนเชื่อมต่อ Host key ครั้งแรกจะถูก pin ใน `SSH_HOST_KEYS_FILE`; ครั้งต่อไปหาก key เปลี่ยนจะถูกปฏิเสธ ควรยืนยัน fingerprint กับผู้ดูแลเครื่องก่อนเชื่อมต่อครั้งแรก แล้วสำรองไฟล์ pin นี้ไว้เมื่อย้ายเซิร์ฟเวอร์

## การย้ายฐานข้อมูลและ migration

### ย้ายไปเครื่องใหม่โดยยังใช้ข้อมูลเดิม

1. หยุดเว็บและตัว worker ที่เขียน PocketBase ชั่วคราว เก็บ backup `pb_data`/snapshot ของ PocketBase พร้อม config, OAuth provider และ `user_type` อย่างปลอดภัย ทดสอบการ restore ในเครื่องทดสอบก่อน
2. ย้าย PocketBase พร้อมข้อมูลเดิมไปเครื่องใหม่ แล้วตรวจ collection และ field สำคัญตามหัวข้อก่อนหน้า โดยเฉพาะ `instances.email`, `owners`, `node`, `vmid` และ rules
3. ตั้ง `.env` ใหม่ด้วย URL/credential ของเครื่องปลายทาง ถ้า public PocketBase URL เปลี่ยน ให้ปรับ provider redirect URL และค่า `VITE_POCKETBASE_URL`; `node scripts/update-pb-url.mjs` เปลี่ยน setting `url` ของ PocketBase ตามค่านี้
4. รัน `npm ci`, `npm run check`, `npm run test:security`, `npm run build`, เปิดเว็บด้วย `ORIGIN` ใหม่ แล้วตรวจ Login → Request → Status → Admin → Console/Power ตามสิทธิ์
5. รัน `npm run sync:nodes` แบบดูผลก่อน หาก mapping ถูกต้องจึงใช้ `npm run sync:nodes -- --apply` ตัววนซิงก์จะทำงานเองเมื่อเปิด dev/production server

### อัปเกรด schema หรือเริ่มฐานข้อมูลเปล่า

**อย่าถือว่า `pb_migrations/1700000000_create_instances.js` และ `scripts/setup-instances.mjs` เป็น schema ปัจจุบัน** ทั้งคู่ยังสร้างฟิลด์ `creator_email` แบบเก่า ขณะที่เว็บปัจจุบันใช้ `email` relation ไป `users`; migration เก่ายังใช้ `passion_group` เป็น text อีกด้วย การรันบนฐานข้อมูลเปล่าแล้วเปิดเว็บทันทีจะไม่ครบ

ทางที่ตรวจสอบได้สำหรับเครื่องใหม่คือ restore snapshot PocketBase ที่มี schema ปัจจุบัน หรือเขียน migration ใหม่จาก schema ในหัวข้อก่อนหน้าและทดสอบกับฐานข้อมูลทดสอบก่อนนำไปใช้จริง ขณะนี้ repository ยังไม่มี migration เดียวที่สร้าง schema ปัจจุบันทั้งหมดจากศูนย์

สำหรับฐานข้อมูลเดิมที่ยังไม่มีเจ้าของร่วม: หลัง backup และตรวจว่า `instances.email` เป็น relation แล้ว ใช้ `node scripts/add-instance-owners.mjs` เพื่อเพิ่ม `owners` และกฎการอ่าน สคริปต์นี้รันซ้ำได้ ส่วน `scripts/patch-instances.mjs` เป็นเครื่องมืออัปเกรดรุ่นเก่าบางฟิลด์ แต่ถ้า `node` ยังไม่มี มันจะเพิ่มเป็น **text** ซึ่งไม่ตรงกับฐานข้อมูลปัจจุบันที่ใช้ number; ตรวจ schema ก่อนรัน ไม่ใช้เป็น migration ครบชุด

บัญชี OAuth ใหม่ต้องมี `user_type` ที่ถูกต้อง โค้ด `src/routes/auth/oidc/+server.ts` กำหนด relation ID ของนักศึกษา **หลัง PocketBase ยืนยัน token** หากเปลี่ยน PocketBase ใหม่ต้องตรวจ ID นี้และแก้ให้ตรง มิฉะนั้น role อาจผิดหรือยังว่าง การกำหนด relation นี้ไม่ตรวจ CS หน้า Login เรียก provider `oidc`; `setup-google-oauth.mjs` ใช้สำหรับ provider `google` แบบเดิมเท่านั้น

## การเชื่อมต่อ Proxmox และซิงก์โหนด

ระบบแปลง `type = vm` เป็น Proxmox `qemu` และ `type = container` เป็น `lxc` ปุ่ม Power/Console จะค้นหา guest จาก cluster inventory ด้วยชนิดและ VMID/CTID เพื่อหา node ปัจจุบัน ไม่ต้องพึ่ง node ที่เคยบันทึกอย่างเดียว

เมื่อ guest ย้าย node สคริปต์ `scripts/sync-instance-nodes.mjs` จะตรวจเป็นรอบเมื่อ dev/production server ทำงาน โดยค่าเริ่มต้นคือ 60 วินาที และกำหนดได้ด้วย `NODE_SYNC_INTERVAL_SECONDS` (30–3600 วินาที) แล้วอัปเดตเฉพาะ `instances.node` โดยคง VMID/CTID เดิมไว้ ต้องจับคู่ **ชนิด + ID ได้รายการเดียว** ทั้งฝั่งฐานข้อมูลและ Proxmox; ถ้าหาย ซ้ำ หรือ node ไม่ใช่รูปแบบ `pve` ตามด้วยตัวเลข จะ `SKIPPED` ไม่แก้ record

```powershell
npm run sync:nodes             # ดูว่าจะเปลี่ยนอะไร (read only)
npm run sync:nodes -- --apply  # ปรับฐานข้อมูลหนึ่งครั้ง
npm run sync:nodes:watch       # worker แยก เมื่อไม่ได้ใช้ loop ที่ติดกับเว็บ
```

ตั้ง `NODE_SYNC_ENABLED=false` หากใช้ worker แยกและไม่ต้องการให้เว็บรัน loop ซ้ำ ถ้า log ขึ้น `SKIPPED ... missing from Proxmox` ให้ตรวจว่า VMID/CTID ในฐานข้อมูลตรงกับ Proxmox และชนิด VM/CT ถูกต้องก่อนแก้ อย่าเปลี่ยน node เพื่อกลบปัญหา ID/ชนิดผิด

## สคริปต์และการทดสอบ

| คำสั่ง/ไฟล์ | ผลที่เกิด | ใช้เมื่อ |
| --- | --- | --- |
| `npm run check` | ตรวจ Svelte/TypeScript | ทุกครั้งก่อนส่งงาน |
| `npm run build` | สร้าง production bundle | ก่อน restart/deploy |
| `npm run test:security` | ทดสอบ role, WebSocket, console grant, SSH host key และตรรกะ PocketBase IAM hook ด้วยข้อมูลจำลอง | หลังแก้ auth/security; **ไม่ใช่การทดสอบ hook บน PocketBase จริง** |
| `node scripts/test-sync-instance-nodes.mjs` | unit test ไม่ต่อฐานข้อมูล | หลังแก้กฎจับคู่โหนด |
| `npm run sync:nodes` | ดูรายการโหนดที่จะเปลี่ยน | ก่อน apply หรือสอบสวน migration |
| `npm run sync:nodes -- --apply` | เขียน `instances.node` ที่จับคู่ได้ | หลังตรวจ dry run |
| `node scripts/add-instance-owners.mjs` | แก้ schema/rules ของ `instances` | อัปเกรด DB เดิมที่ยังไม่มี `owners` |
| `node scripts/harden-pocketbase-rules.mjs` | ตรวจ rule ปัจจุบันโดยไม่แก้ฐาน; เพิ่ม `--apply` เพื่อเขียน rule พร้อม backup | ตรวจ drift ก่อนปรับสิทธิ์ฐานร่วม |
| `node scripts/patch-instances.mjs` | เพิ่มบางฟิลด์ใน schema รุ่นเก่า | หลังตรวจ schema และ backup เท่านั้น |
| `node scripts/seed-templates.mjs` | ดึง preset จาก community-scripts แล้วเขียน `templates` | เติมแค็ตตาล็อก; ใช้ network และเวลาพอสมควร |
| `node scripts/update-pb-url.mjs` | เปลี่ยน public URL setting ของ PocketBase | ย้ายโดเมน OAuth |
| `node scripts/setup-google-oauth.mjs` | แก้ provider `google` | ดูแลเส้นทาง Google เดิม ไม่ใช่ `oidc` |
| `node scripts/fix-oauth-mappings.mjs` | แก้ field mapping ของ OAuth provider | แก้ปัญหา mapping หลังตรวจ provider |
| `node scripts/debug-templates.mjs` | อ่าน schema/preset ตัวอย่าง | preset ไม่ขึ้น |
| `scripts/debug-auth.mjs`, `scripts/reset-pw.mjs` | สคริปต์เก่ามี URL/credential คงที่ และตัวหลังเปลี่ยนรหัสผู้ใช้ | **อย่ารันตามตัวอย่างเดิม**; ตรวจ/ปรับให้รับค่าจาก env ก่อน |

Integration test ต่อไปนี้ต้องมีเว็บและ PocketBase จริง พร้อมบัญชีทดสอบที่ทีมจัดให้ผ่าน `TEST_ADMIN_USER_EMAIL`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` โดยไม่ใส่ค่าลง Git:

```powershell
node scripts/test-instance-owners.mjs # สร้างคำขอทดสอบชั่วคราว แล้วลบ
node scripts/test-owner-pages.mjs     # ทดสอบหน้า/สิทธิ์ และสร้างคำขอชั่วคราว
node scripts/test-console.mjs         # ต้องมี VM และ CT ที่กำลังรัน ออก console ticket ชั่วคราว
```

การทดสอบ console ใช้ Proxmox จริงและต้องมี guest ที่กำลังรัน ไม่ควรใช้ปุ่ม Auto Provision เป็นการทดสอบทั่วไปเพราะสร้าง guest จริง

ผลตรวจล่าสุด 24 กันยายน 2026: `npm run check` ผ่านโดยไม่มี error/warning, `npm run build` ผ่าน และ `npm run test:security` ผ่าน 10 รายการ ทดสอบหน้า `/status` กับ PocketBase จริงก่อนหน้านี้แล้วพบทั้งเครื่องที่บัญชีเป็นผู้ขอและเป็นเจ้าของร่วมหลังแยก query; `/auth/oidc` รับ PocketBase token ที่ถูกต้องและปฏิเสธ record ID ที่ไม่ตรง ยัง **ไม่ได้** ทดสอบการล็อกอิน IAM ของบัญชี CS/ต่างสาขาบน hook ที่ติดตั้งจริง

## แก้ปัญหาที่พบบ่อย

| อาการ | ตรวจตามลำดับ |
| --- | --- |
| ล็อกอิน OAuth ไม่ผ่าน | ตรวจ provider `oidc` ใน `users`, redirect URL ของ PocketBase, `VITE_POCKETBASE_URL`, auth hook บนเครื่อง PocketBase, `role`/สาขาที่ IAM ส่ง และ log PocketBase กับ `/auth/oidc` |
| ต้องการข้อมูล IAM เพิ่มจาก OAuth | ตรวจ UserInfo ที่ IAM ส่งด้วย scope ปัจจุบันก่อน; ถ้าขาด claim ให้ขอชื่อ scope จาก IAM แล้วเพิ่มใน `authWithOAuth2({ scopes: [...] })` โดยคง `openid`, `email`, `profile`; scope ไม่ใช่ตัวกรองสาขา |
| เพิ่มเจ้าของร่วมแล้ว VM/CT หายจาก Status | หน้า Status ต้องค้น `email = user ID` และ `owners.id ?= user ID` แยกคำสั่งแล้วรวมผล; ตัวกรอง OR เดิมบน relation ให้ผลตกหล่น ตรวจว่า PocketBase query สำเร็จทั้งสองคำสั่ง |
| ล็อกอินได้แต่ `/admin` 403 | ตรวจ `users.user_type` และ `user_type.type = admin`; แยก PocketBase superuser จากเว็บแอดมิน |
| เพิ่มเจ้าของร่วมไม่ได้ | อีเมลต้องมีบัญชี `users` ก่อน; สูงสุด 10 คน; ตรวจฟิลด์ `owners` และ rule ของ `instances` |
| Power/Console บอก guest ไม่พบ หรือ `.conf does not exist` | ตรวจ VMID/CTID, ชนิด `vm`/`container` และ guest จริงใน cluster; รัน `npm run sync:nodes` ดูรายการ `SKIPPED` |
| VM เปิดไม่ได้หลังย้าย node | ตรวจ Proxmox task และ guest inventory; API จะหา node ปัจจุบันจากชนิด+ID; หากหาไม่ได้ให้แก้ record ให้ตรง guest |
| Console เปิดไม่ได้ | ตรวจ Proxmox API token/session permission, `PROXMOX_PASSWORD`, `ORIGIN`, WebSocket proxy `/proxmox-ws`, certificate และ browser console |
| SSH ตอบ `All configured authentication methods failed` | ใช้รหัส/คีย์ของ guest OS, ตรวจ username, `sshd`, firewall, root login policy; รหัสเว็บคนละชุด |
| SSH ไม่มี IP | ตรวจ `instances.IP`, guest network, DHCP และ QEMU Guest Agent สำหรับ VM; Console อาจยังใช้ได้แม้ SSH ไม่มี IP |
| Auto Provision ค้าง/ล้มเหลว | ตรวจ Proxmox task, template ID ใน `static/constant.ts`, `TEMPLATE_NODE`, storage/network และว่ามี guest ID ถูกสร้างไปแล้วหรือไม่ ก่อน retry |
| รายการไม่อัปเดตทันที | ตรวจ `VITE_POCKETBASE_URL` จากเบราว์เซอร์, PocketBase realtime connection และ collection rules; refresh เพื่อเทียบกับข้อมูลจริง |

## รายการส่งมอบให้รุ่นถัดไป

- ที่เก็บ backup PocketBase และวิธี restore ที่เคยทดสอบ พร้อมผู้รับผิดชอบการหมุนเวียน secret
- URL ของเว็บ, PocketBase, Proxmox, IAM/OIDC และ Discord webhook ผ่านช่องทางลับ ไม่ใส่ credential ลงคู่มือ
- บัญชีเว็บแอดมิน, PocketBase superuser และ Proxmox token แยกกัน พร้อมรายการสิทธิ์ที่ให้ไว้
- รายการ base VM/CT template, VMID ของ template, `TEMPLATE_NODE`, storage และ network bridge/tag ที่ใช้จริง
- วิธี start/restart/ดู log ของ process manager เครื่องจริง รวมทั้ง WebSocket proxy และ `NODE_SYNC_*`
- ผล `npm run check`, `npm run build`, dry run node sync และการทดสอบ Login/Request/Status/Admin/Power/Console ด้วยบัญชีทดสอบ
- สถานะการติดตั้ง PocketBase IAM hook, เวอร์ชัน PocketBase, ผลทดสอบบัญชี CS/ต่างสาขา, path ของสาขาปัจจุบันใน `StudentProfile` และชื่อ scope IAM หากต้องเพิ่ม; ตอนปรับคู่มือนี้ยังไม่ยืนยันว่าติดตั้ง hook และยังไม่มีตัวอย่าง `StudentProfile` จริง
- รายการ record ที่ `SKIPPED` จาก node sync และเหตุผลที่แก้หรือยังไม่แก้

ข้อจำกัดที่ควรทราบ: progress ของ Auto Provision อยู่ใน memory; restart เว็บระหว่างงานทำให้หน้าแอดมินไม่เห็น progress เดิม แม้ Proxmox อาจทำงานต่อหรือสร้าง guest ไปแล้ว โค้ด Auto Provision มีค่า cloud-init bootstrap ใน `src/lib/proxmox.ts` ที่ต้องเปลี่ยน/หมุนเวียนตามนโยบายเครื่องจริง และ repository ยังไม่มี migration ปัจจุบันครบชุดสำหรับตั้งฐานข้อมูลเปล่า `vite.config.ts` ของ dev server ตรวจ SSH session น้อยกว่า `server.js` ของ production จึงควรเปิด dev server เฉพาะเครื่อง/เครือข่ายพัฒนาที่เชื่อถือได้
