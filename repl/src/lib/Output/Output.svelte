<script>
  import { get_repl_context } from "$lib/context.js";
  import AstView from "./AstView.svelte";
  import { parse } from "../../../../src/parser.ts";

  // export let theme;
  export let showAst = false;

  /**
   * @param {import('$lib/types').File} file
   * @param {import('svelte/compiler').CompileOptions} options
   */
  export async function set(file, options) {
    ast = parse(file.source, { withLoc: true });
  }

  /**
   * @param {import('$lib/types').File} selected
   * @param {import('svelte/compiler').CompileOptions} options
   */
  export async function update(selected, options) {
    ast = parse(selected.source, { withLoc: true });
  }

  const { module_editor } = get_repl_context();

  /** @type {'documentation' | 'ast'} */
  let view = "ast";

  /** @type {import('svelte/types/compiler/interfaces').Ast} */
  let ast;
</script>

<div class="view-toggle">
  <button
    class:active={view === "documentation"}
    on:click={() => (view = "documentation")}>Documentation</button
  >
  {#if showAst}
    <button class:active={view === "ast"} on:click={() => (view = "ast")}
      >AST output</button
    >
  {/if}
</div>

<!-- component viewer -->
<div class="tab-content" class:visible={view === "documentation"}>TODO</div>

<!-- ast output -->
{#if showAst}
  <div class="tab-content" class:visible={view === "ast"}>
    <!-- ast view interacts with the module editor, wait for it first -->
    {#if $module_editor}
      <AstView {ast} autoscroll={view === "ast"} />
    {/if}
  </div>
{/if}

<style>
  .view-toggle {
    height: 4.2rem;
    border-bottom: 1px solid var(--sk-text-4);
    white-space: nowrap;
    box-sizing: border-box;
  }

  button {
    /* width: 50%;
		height: 100%; */
    background: var(--sk-back-1, white);
    text-align: left;
    position: relative;
    font: 400 12px/1.5 var(--sk-font);
    border: none;
    border-bottom: 3px solid transparent;
    padding: 12px 12px 8px 12px;
    color: var(--sk-text-2, #999);
    border-radius: 0;
  }

  button.active {
    border-bottom: 3px solid var(--sk-theme-1, --prime);
    color: var(--sk-text-1, #333);
  }

  div[slot] {
    height: 100%;
  }

  .tab-content {
    position: absolute;
    width: 100%;
    height: calc(100% - 42px) !important;
    visibility: hidden;
    pointer-events: none;
  }

  .tab-content.visible {
    visibility: visible;
    pointer-events: all;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }
</style>
