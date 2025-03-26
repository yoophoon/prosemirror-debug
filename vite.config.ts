// vite configuration for building the GitHub Pages site

import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths'
import {createHtmlPlugin} from 'vite-plugin-html'
import {resolve} from 'path'

export default defineConfig({
	base: "/prosemirror-debug/",
	build: {
		rollupOptions:{
			// external:["rope-sequence"],
		},
		outDir: "dist-site",
	},
	plugins: [
		tsConfigPaths(),
		createHtmlPlugin({
			minify:false,
			pages:[
				{
					entry:'src/main.ts',
					template:'index.html',
					filename:'index.html',
				},
				{
					entry:resolve(__dirname,'mainHistory/prosemirror-tables-demo/demo.ts'),
					template:'tablesDemo.html',
					filename:'tablesDemo.html'
				}
			]
		})
	],
	server:{
		port:23333
	}
})