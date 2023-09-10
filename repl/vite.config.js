import { sveltekit } from '@sveltejs/kit/vite';

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [sveltekit()],
	resolve: {
		dedupe: ['@codemirror/state', '@codemirror/language', '@codemirror/view'],
		alias: {
			'@bench': '../bench'
		}
	},
	server: {
		fs: {
			strict: false
		}
	}
};

export default config;
