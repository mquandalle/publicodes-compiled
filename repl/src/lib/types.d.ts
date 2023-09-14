import type { EditorState } from "@codemirror/state";
import { OutputChunk } from "@rollup/browser";
import type { Readable, Writable } from "svelte/store";
import { CompileOptions } from "svelte/compiler";

export type Lang =
  | "js"
  | "svelte"
  | "json"
  | "md"
  | "css"
  | (string & Record<never, never>);

type StartOrEnd = {
  line: number;
  column: number;
  character: number;
};

export type MessageDetails = {
  start: StartOrEnd;
  end: StartOrEnd;
  filename: string;
  message: string;
};

export type Warning = MessageDetails;

export type Error = MessageDetails & {
  name: string;
  code: string;
  pos: number;
  frame: string;
  pluginCode: string;
  plugin: string;
  hook: string;
  id: string;
  watchFiles?: string[] | null;
  stack: string;
};

export type Bundle = {
  uid: number;
  dom: OutputChunk | null;
  error: Error | null;
  ssr: OutputChunk | null;
  imports: string[];
  warnings: Warning[];
};

export type File = {
  name: string;
  source: string;
  type: Lang;
  modified?: boolean;
};

export type ReplState = {
  files: File[];
  selected_name: string;
  selected: File | null;
  bundle: Bundle | null;
  bundling: Promise<void>;
  bundler: import("./Bundler").default | null;
  compile_options: CompileOptions;
  cursor_pos: number;
  toggleable: boolean;
  module_editor: import("./CodeMirror.svelte").default | null;
  output: import("./Output/Output.svelte").default | null;
  error_message: string;
};

export type ReplContext = {
  files: Writable<ReplState["files"]>;
  selected_name: Writable<ReplState["selected_name"]>;
  selected: Readable<ReplState["selected"]>;
  bundle: Writable<ReplState["bundle"]>;
  bundling: Writable<ReplState["bundling"]>;
  bundler: Writable<ReplState["bundler"]>;
  compile_options: Writable<ReplState["compile_options"]>;
  cursor_pos: Writable<ReplState["cursor_pos"]>;
  toggleable: Writable<ReplState["toggleable"]>;
  module_editor: Writable<ReplState["module_editor"]>;
  output: Writable<ReplState["output"]>;
  error_message: Writable<ReplState["error_message"]>;

  EDITOR_STATE_MAP: Map<string, EditorState>;

  // Methods
  rebundle(): Promise<void>;
  handle_select(filename: string): Promise<void>;
  handle_change(
    event: CustomEvent<{
      value: string;
    }>
  ): Promise<void>;
  go_to_warning_pos(item?: MessageDetails): Promise<void>;
  clear_state(): void;
};
