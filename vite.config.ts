import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
    }
});