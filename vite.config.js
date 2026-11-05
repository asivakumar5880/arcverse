import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/arcverse/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        anime: resolve(__dirname, 'anime.html'),
        login: resolve(__dirname, 'login.html'),
      },
    },
  },
})
