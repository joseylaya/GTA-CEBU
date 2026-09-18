import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import supportConversation from './api/support/conversation.js';

function localSupportApi() {
  return {
    name: 'local-support-api',
    configureServer(server) {
      server.middlewares.use('/api/support/conversation', (request, response) => supportConversation(request, response));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localSupportApi()],
  build: { outDir: 'dist' },
});
