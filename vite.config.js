import { defineConfig } from 'vite';

// Relative asset paths, so the build works from any sub-path, e.g. https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
});
