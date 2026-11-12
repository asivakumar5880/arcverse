import { defineConfig } from 'vite'
import { resolve } from 'path'
import { adminAuthPlugin } from './server/adminAuth.js'

export default defineConfig({
  plugins: [adminAuthPlugin()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        anime: resolve(__dirname, 'anime.html'),
        login: resolve(__dirname, 'login.html'),
        signup: resolve(__dirname, 'signup.html'),
      },
    },
  },
})
