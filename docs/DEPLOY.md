# Deploy init.d

ใช้ GitHub Actions → Deploy init.d เมื่อ push เข้า main หรือกด Run workflow โดย self-hosted Linux runner ส่งไฟล์ผ่าน SSH port 22 และรัน PM2 บน server Ubuntu/Debian ด้วย root

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

ก่อน restart ติดตั้งเฉพาะ production dependencies (ข้าม npm lifecycle scripts) แล้วตรวจ HTTP /login หลังรันสำเร็จจึง pm2 save และลบ node_modules/.svelte-kit/build/dist บน runner; Node tool cache และ npm cache ยังใช้ซ้ำได้

ไม่ส่ง source ทั้งโปรเจกต์ ไม่ลบ data/, .data/ หรือ uploads บน server แต่ทับ .env จาก ENV_FILE ทุก deploy และไม่มี rollback อัตโนมัติ หากเปลี่ยน VITE_* ที่ใช้ฝังใน client ให้ตั้ง GitHub Variable ที่ workflow ใช้อ่านและ build ใหม่ ค่า server env อื่นแก้ใน ENV_FILE แล้ว deploy
