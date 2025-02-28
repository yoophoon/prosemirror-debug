// vite configuration for building the GitHub Pages site

import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	plugins: [tsConfigPaths()],
	base: "/prosemirror-debug/",
	build: {
		outDir: "dist-site",
	},
	server:{
		port:23333
	}
})