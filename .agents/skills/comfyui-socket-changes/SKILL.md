---
name: comfyui-socket-changes
description: Use whenever changing ComfyUI node input or output sockets, widget-backed schema inputs, dynamic/autogrow ports, or frontend socket lifecycle code.
---

# ComfyUI Socket Changes

Use this skill for every change that can add, remove, rename, hide, restore, or reorder a ComfyUI node socket. This repository uses the ComfyUI V3 schema and frontend LiteGraph sockets.

## Check schema and frontend together

- Inspect the node's `define_schema()` and its frontend lifecycle hooks before changing port behavior.
- A widget used only by an editor or hidden in the frontend must use `socketless=True` in its `io.*.Input(...)` schema. Hiding a widget with `hideWidget()` only hides the widget; it does not remove a socket already created for the schema input.
- For dynamic `io.Autogrow.Input("values", ...)` ports, use the actual generated slot names consistently (for example, `values.a`). Do not add a second port for a slot the schema or Autogrow already created.
- When adding/removing ports dynamically, keep backend input/output definitions, frontend slot creation, saved configuration, visible labels, and execution arguments in sync.

## Handle existing workflows

- Workflows can retain sockets created by older schemas after the current schema is fixed. Clean those legacy sockets when a node is created/configured from a saved workflow, and remove dangling graph links that target removed socket indexes.
- For nodes whose only real graph inputs are dynamic `values.*` sockets, remove any stale non-`values.*` editor/configuration sockets during migration. For nodes with legitimate fixed sockets, remove only the known obsolete socket names.
- Dedupe dynamic slots by their full socket name after node restoration and after connection changes. If duplicate slots have links, preserve the linked slot and remove the empty duplicate when possible.
- Never treat a hidden widget as proof that its associated socket is gone. Verify the node's actual `inputs`/`outputs` arrays and graph links.

## Verify the change

- Check a newly created node and a node loaded from an older workflow. Confirm that each intended socket appears once, the socket labels align with their rows, and a wire can connect to the intended port without an overlapping ghost port.
- Check connect/disconnect and add/delete behavior for dynamic ports, including whether removed ports leave stale graph links or shift existing connections to a different variable.
- Run Python syntax checks for changed node schemas, JavaScript syntax/lint checks available in the environment, and `git diff --check`.
- If ComfyUI cannot be run in the environment, say that visual socket behavior remains unverified and give the user the precise restart/reload step needed to load schema changes.
