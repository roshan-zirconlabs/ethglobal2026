import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Local HTTPS so the phone (camera + WebNFC need a secure context) can use it
    // over the LAN. Self-signed — tap through the warning once on the phone.
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'NotWallet',
        short_name: 'NotWallet',
        description: 'Offline signer for MetaMask — your key never leaves your phone.',
        theme_color: '#0c0e14',
        background_color: '#0c0e14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    host: true, // expose on LAN for phone testing
  },
});
