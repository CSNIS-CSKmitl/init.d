# Deploy init.d

ใช้ GitHub Actions → Deploy init.d เมื่อ push เข้า main หรือกด Run workflow โดย self-hosted Linux runner ส่งไฟล์ผ่าน SSH port 22 และรัน PM2 บน server Ubuntu/Debian ด้วย root

Workflow แยก 4 jobs: **Check → Build → Deploy → Verify** และใช้ `needs` ให้รันตามลำดับ ทุก job คง `runs-on: [self-hosted, linux]` และใช้ GitHub Environment `env` ตามเดิม

| Job | หน้าที่ |
| --- | --- |
| Check | ตรวจโค้ดด้วยคำสั่งเดิมของโปรเจกต์ หากไม่ผ่านจะไม่ Build/Deploy |
| Build | Build และแพ็กเฉพาะ runtime เป็น tar.gz แล้วอัปโหลด artifact อายุ 1 วัน โดยไม่มี `.env` หรือ `node_modules` |
| Deploy | ดาวน์โหลด artifact, ตรวจค่าปลายทาง, เตรียม server, ส่ง runtime และ `.env` จาก Secret `ENV_FILE`, ติดตั้ง production dependencies และ restart PM2 |
| Verify | SSH ตรวจ HTTP health endpoint ของแอปบน port 3000 แล้ว `pm2 save` เมื่อผ่าน |

Check และ Build ล้าง generated output กับ dependencies ด้วย `if: always()` เมื่อจบ job; Deploy ล้าง artifact ที่ดาวน์โหลดและ staging ชั่วคราว Shared Node/npm cache ยังใช้ซ้ำได้ แต่ละ job รับไฟล์ build ผ่าน artifact จึงไม่อาศัย workspace ของ job ก่อนหน้า

ใช้ runner เครื่องเดิมได้โดยไม่ต้องเพิ่ม labels หากมีหลายเครื่องที่ตรง `[self-hosted, linux]` GitHub อาจเลือกคนละเครื่อง จึงต้องเตรียม SSH key/known_hosts บนเครื่องที่รับ Deploy และ Verify ให้พร้อม

ตั้ง GitHub Settings → Environments → env:

| ประเภท | ชื่อ | ค่า |
| --- | --- | --- |
| Secret | SSH_HOST | hostname/IP ปลายทาง |
| Secret | SSH_USER | root หรือ user ที่เตรียม dependency ไว้แล้ว |
| Secret | ENV_FILE | เนื้อหา production .env ทั้งไฟล์ |
| Variable | DEPLOY_PATH | absolute path เช่น /root/init.d |
| Variable | PM2_APP_NAME | ค่าเริ่มต้น initd |
| Variable (optional) | VITE_POCKETBASE_URL | ค่าเริ่มต้น /api/db เฉพาะ client ที่ใช้ Vite env นี้ |

Runner ต้องมี SSH key/known_hosts ใน user ที่รัน service และมี rsync ส่วน server จะติดตั้ง rsync, Node 24 ผ่าน nvm พร้อม npm และ PM2 ที่ขาดให้เอง ต้องเข้าถึง apt repositories, GitHub, nodejs.org และ npm registry ได้ หากมีหลาย runners ให้เพิ่ม custom label ใน runs-on

Workflow ส่ง build และ runtime files พร้อม .env โดยไม่ต้องสร้างไฟล์ env เองบน server ใช้ ecosystem.config.cjs ให้ PM2 รัน server.js ด้วย working directory ปลายทางและ Node --env-file=.env ค่า PORT ใน ENV_FILE ต้องไม่ชนแอปอื่น (default 3000); เว็บ SvelteKit ต้องตั้ง ORIGIN ให้ตรง public URL

ไม่ส่ง source ทั้งโปรเจกต์ ไม่ลบ data/, .data/ หรือ uploads บน server แต่ทับ .env จาก ENV_FILE ทุก deploy และไม่มี rollback อัตโนมัติ หากเปลี่ยน VITE_* ที่ใช้ฝังใน client ให้ตั้ง GitHub Variable ที่ workflow ใช้อ่านและ build ใหม่ ค่า server env อื่นแก้ใน ENV_FILE แล้ว deploy

Deploy ผ่าน PM2 กำหนด PORT=3000 และ health check ใช้ port เดียวกัน แม้ ENV_FILE จะมีค่า PORT เดิม ให้ reverse proxy ชี้ไป port 3000; หลายแอปบนเครื่องเดียวกันต้องแยก IP หรือเครื่องเพื่อไม่ให้ port ชนกัน

## การตรวจสอบการแจ้งเตือน Discord

กำหนด `DISCORD_WEBHOOK_URL` ใน GitHub Environment `env` → Secret `ENV_FILE` โดยใช้ webhook ของช่องปลายทาง และแยกตัวแปรแต่ละรายการด้วยการขึ้นบรรทัดใหม่ ห้ามนำ `OIDC_USERINFO_URL=...` ต่อท้าย URL ของ webhook ระบบรองรับการตัดส่วนที่ต่อท้ายผิดในกรณีนี้เพื่อให้แจ้งเตือนได้ แต่ยังควรแก้ต้นฉบับใน Secret เพื่อไม่ให้ค่าผิดกลับมาเมื่อ deploy ครั้งถัดไป

บนเซิร์ฟเวอร์ เปิดไดเรกทอรีที่ deploy แล้วรัน `npm run check:discord` เพื่อตรวจการตั้งค่าและการเข้าถึง webhook ด้วย GET โดยไม่ส่งข้อความ คำสั่งไม่แสดง URL, token หรือข้อมูลของช่อง หากพบ HTTP 404 ให้ตรวจว่า webhook ยังอยู่และ token ถูกต้อง หากเชื่อมต่อไม่ได้ ให้ตรวจ DNS และ outbound HTTPS ของเซิร์ฟเวอร์

การส่งข้อความรอการยืนยันจาก Discord (`wait=true`) มี timeout และลองซ้ำเมื่อพบ rate limit ระยะสั้นหรือ HTTP 5xx ข้อความใน embed ถูกจำกัดความยาวตามที่ Discord รองรับ ความผิดพลาดของ Discord ไม่ยกเลิกคำขอหรือเปลี่ยนผลการ provision ดูผลส่งจาก `pm2 logs initd` หรือชื่อแอปที่กำหนดใน `PM2_APP_NAME` โดยค้นหา `[Discord Webhook]`

อ้างอิง: [Discord Execute Webhook](https://docs.discord.com/developers/resources/webhook#execute-webhook), [Discord Rate Limits](https://docs.discord.com/developers/topics/rate-limits)

## งาน Proxmox ที่ใช้เวลานานและรายการ timeout เดิม

ระบบรอผล task จาก Proxmox โดยไม่ตัดสินว่า Failed เพราะเกิน 10 นาที งานที่ยังเป็น `running` จะรอต่อ และความขัดข้องชั่วคราวขณะอ่านสถานะไม่ถือเป็นความล้มเหลวของงาน จะรายงาน Failed เมื่อ Proxmox ส่ง `stopped` พร้อม exit status ที่ไม่ใช่ `OK` เท่านั้น

รายการเก่าที่บันทึกข้อความ `Timed out waiting for task UPID:...` จะตรวจ UPID เดิมและ VMID จาก Proxmox เพื่อแสดงสถานะปัจจุบันในหน้า Admin และ Status โดยไม่เริ่ม clone หรือ migration ใหม่ ขณะงานยังทำงานหรือยังยืนยันผลไม่ได้ จะป้องกันการ resolve, เปลี่ยน VMID และลบรายการนั้น

หาก task เดิมจบด้วย `OK` รายการจะรอให้ผู้ดูแลตรวจ VM/CT และขั้นตอนที่เหลือก่อนยืนยัน Complete เนื่องจากกระบวนการเดิมหยุดไปตอน timeout และการย้ายสำเร็จเพียงอย่างเดียวไม่ยืนยันว่าการตั้งค่า เปิดเครื่อง หรืออ่าน IP เสร็จแล้ว การแสดงผลนี้ไม่แก้ประวัติในฐานข้อมูลโดยอัตโนมัติ และยังไม่รองรับการกู้ pipeline ทั้งหมดหลัง restart กระบวนการเว็บ
