# comfyui-objn-tools

Custom nodes for ComfyUI. This pack includes tools for text, expressions, choices, and workflows.

## Installation

1. Stop ComfyUI.
2. Copy or download this repository into the `custom_nodes` folder in your ComfyUI installation.
3. Make sure the final folder is named `comfyui-objn-tools` and contains `__init__.py` directly inside it.

The folder layout should look like this:

```text
ComfyUI/
+-- custom_nodes/
    +-- comfyui-objn-tools/
        +-- __init__.py
        +-- nodes/
        +-- web/
```

4. Start ComfyUI again. The nodes should appear in the `objn` categories in the node menu.

This repository has no separate `requirements.txt` file and does not need extra Python packages. It uses the ComfyUI API, so keep ComfyUI up to date.

## Included nodes

- **Calculator (PEMDAS)** and **Compare (Logic)** for expressions and conditions.
- **Router**, **Flow Input**, and **Flow Output** for choosing and running saved workflows.
- **Radio Selection** and **Checkbox Selection** for user choices.
- **Display Number** and **Tokenizer** for displaying and processing values.

## Using Router

1. Save the workflows you want to use as JSON files in ComfyUI's `user/default/workflows` folder.
2. In a workflow, use **Flow Input** to receive a value by name and **Flow Output** to return a value by name.
3. Add a **Router** node and open its editor.
4. Use the **Import** tab to select saved workflows. Set the rules that choose which workflow to run, then apply the changes.

On Windows portable installs, the workflow folder is usually:

```text
ComfyUI_windows_portable/ComfyUI/user/default/workflows
```

## Troubleshooting

- If the nodes do not appear, check the ComfyUI console for import errors and confirm that the folder is inside `custom_nodes`.
- After changing or reinstalling this pack, restart ComfyUI and refresh the browser page.
- If Router cannot find a workflow, check that its JSON file is in `user/default/workflows` and that its Flow Input and Flow Output names match the Router setup.
