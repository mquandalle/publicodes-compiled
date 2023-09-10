<script>
	import Repl from '$lib/Repl.svelte';
	import { onMount } from 'svelte';
	import '@sveltejs/site-kit/styles/index.css';
	import sasuExample from '../../../bench/sasu.publicodes.yaml?raw';

	/** @type {Repl} */
	let repl;

	onMount(() => {
		repl.set({
			files: [
				{
					name: 'Sasu',
					type: 'publicodes',
					source: sasuExample
				}
			]
		});
	});
</script>

<main>
	<Repl bind:this={repl} showAst autocomplete={true} />
</main>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}

	main {
		height: 100vh;
	}
</style>
