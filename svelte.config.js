import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),

    compilerOptions: {
        // บังคับใช้ Runes Mode ยกเว้นใน node_modules
        runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
    },

    kit: {
        // ใช้ adapter-auto ตามโค้ดต้นฉบับของโปรเจกต์นี้
        adapter: adapter(),
        alias: {
            $static: './static'
        }
    }
};

export default config;