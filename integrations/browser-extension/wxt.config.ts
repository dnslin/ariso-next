import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Ariso',
    description: '将本地、剪贴板和网页图片上传到你自己的 Ariso。',
    minimum_chrome_version: '120',
    permissions: ['storage', 'contextMenus'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: '打开 Ariso 上传小窗' },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
