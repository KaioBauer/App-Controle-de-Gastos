import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Gera pwa-64x64, pwa-192x192, pwa-512x512, maskable-icon-512x512, apple-touch-icon-180x180 e favicon
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // O SVG já é full-bleed com o fundo escuro do Kaixa; o iOS arredonda os cantos
    apple: { sizes: [180], padding: 0, resizeOptions: { background: '#0E0F12' } },
    maskable: { sizes: [512], padding: 0, resizeOptions: { background: '#0E0F12' } },
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']], padding: 0 },
  },
  images: ['public/logo.svg'],
});
