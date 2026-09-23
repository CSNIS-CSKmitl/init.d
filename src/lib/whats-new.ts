// Edit this file to publish the post-login update dialog.
// Change version whenever the message changes so users see the new update once.
// Set enabled to false to hide the dialog for everyone.
export const whatsNew = {
	enabled: true,
	version: '2026-09-24-2',
	title: 'มีอะไรใหม่ใน init.d',
	intro: 'อัปเดตการขอและจัดการ VM/CT รอบนี้',
	items: [
		{
			title: 'เพิ่มเจ้าของร่วม',
			description: 'ระบุเจ้าของร่วมตอนส่งคำขอ หรือแก้รายชื่อภายหลังได้ที่หน้า Status'
		},
		{
			title: 'Console สำหรับ VM และ CT',
			description: 'VM ใช้จอ noVNC ส่วน CT ใช้ terminal ผ่าน Proxmox'
		},
		{
			title: 'SSH ใช้พร้อมกันได้มากขึ้น',
			description: 'เปิด SSH ได้สูงสุด 8 session ในหน้าต่างที่กว้างขึ้น'
		},
		{
			title: 'ตามโหนดปัจจุบันอัตโนมัติ',
			description: 'เมื่อ VM/CT ย้ายโหนด ระบบจะซิงก์ข้อมูลโหนดจาก Proxmox'
		},
		{
			title: 'หน้าจัดการเครื่องพร้อมกราฟ',
			description: 'กดชื่อเครื่องที่หน้า Status เพื่อดู CPU, RAM, Network และเลือก Console, SSH หรือคำสั่งพลังงาน'
		}
	]
} as const;
