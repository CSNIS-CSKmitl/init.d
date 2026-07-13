import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    plugins: [
        tailwindcss(),
        sveltekit() // ปล่อยว่างไว้ เพื่อให้วิ่งไปอ่าน svelte.config.js
    ],
    server: {
        // เก็บการตั้งค่าเพื่อส่องไฟล์นอก Source Tree ของ Vite 8 ไว้ที่นี่
        fs: {
            allow: ['..', '.svelte-kit', '.svelte-kit/**']
        }
    },    build: {
        sourcemap: false // ยึดมั่นปิดช่องโหว่ซอร์สโค้ดหลุดไว้ตรงนี้
    },
    resolve: {
    alias: {
      // This maps '$static' to 'D:/KMITL/init.d/static' (or wherever your static folder lives)
      $static: path.resolve(__dirname, './static'), 
    },
  },
});