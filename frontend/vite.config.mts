import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers/**/*', dest: `${cesiumBaseUrl}/Workers` },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty/**/*', dest: `${cesiumBaseUrl}/ThirdParty` },
        { src: 'node_modules/cesium/Build/Cesium/Assets/**/*', dest: `${cesiumBaseUrl}/Assets` },
        { src: 'node_modules/cesium/Build/Cesium/Widgets/**/*', dest: `${cesiumBaseUrl}/Widgets` }
      ]
    })
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`)
  }
});