import { defineConfig } from 'vite';

// Relative asset paths, so the build works from any sub-path, e.g. https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  // a new value on every build, so each deploy asks browsers for a fresh letter.pdf instead of a cached one
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
});
