import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig(async ({ command }) => {
  const plugins = []
  if (command === 'serve') {
    try {
      const { adminAuthPlugin } = await import('./server/adminAuth.js')
      plugins.push(adminAuthPlugin())
    } catch (e) {
      console.warn('[Vite] Local adminAuthPlugin not loaded:', e.message)
    }
  }

  return {
    base: '/arcverse/',
    plugins,
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          anime: resolve(__dirname, 'anime.html'),
          login: resolve(__dirname, 'login.html'),
          signup: resolve(__dirname, 'signup.html'),
          notFound: resolve(__dirname, '404.html'),
        },
      },
    },
  }
})
