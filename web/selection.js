import { app } from "../../scripts/app.js";
import { ensureStyle, h, hideWidget, openPanel } from "./objn_ui.js";

const NODES = { ObjnRadioSelection: "radio", ObjnCheckboxSelection: "checkbox" };

function parseOptions(text) {
    return text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
        const at = l.indexOf("=>");
        return at < 0 ? { label: l, value: l } : { label: l.slice(0, at).trim(), value: l.slice(at + 2).trim() };
    });
}

function openOptionsEditor(node, onSave) {
    const optionsWidget = node.widgets.find((w) => w.name === "options");
    const rows = parseOptions(optionsWidget.value);
    const list = h("div", "objn-rows");
    const add = h("button", "objn-btn ghost", "+ Add option");

    function field(row, key, placeholder) {
        const input = h("input", "objn-input");
        input.value = row[key];
        input.placeholder = placeholder;
        input.oninput = () => (row[key] = input.value);
        return input;
    }

    function refresh() {
        list.replaceChildren(...rows.map((row, i) => {
            const x = h("button", "objn-x", "\u00D7");
            x.title = "Delete option";
            x.onclick = () => {
                rows.splice(i, 1);
                refresh();
            };
            return h("div", "objn-row", field(row, "label", "Label"), field(row, "value", "Same as label"), x);
        }));
        list.append(add);
    }

    add.onclick = () => {
        rows.push({ label: "", value: "" });
        refresh();
        list.querySelectorAll(".objn-row")[rows.length - 1].querySelector("input").focus();
    };

    refresh();
    openPanel({
        title: `${node.title} \u00B7 options`,
        applyLabel: "Save",
        content: [h("div", "objn-cols", h("span", "objn-label", "Label (shown)"), h("span", "objn-label", "Output value")), list],
        onApply: () => {
            optionsWidget.value = rows
                .map((r) => ({ label: r.label.trim(), value: r.value.trim() }))
                .filter((r) => r.label)
                .map((r) => (r.value && r.value !== r.label ? `${r.label} => ${r.value}` : r.label))
                .join("\n");
            onSave();
        },
    });
}

app.registerExtension({
    name: "objn.Selection",
    beforeRegisterNodeDef(nodeType, nodeData) {
        const kind = NODES[nodeData.name];
        if (!kind) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            ensureStyle();
            const optionsWidget = this.widgets.find((w) => w.name === "options");
            const selectedWidget = this.widgets.find((w) => w.name === "selected");
            hideWidget(optionsWidget);
            hideWidget(selectedWidget);

            const list = h("div", "objn-choices");
            const group = `objn-radio-${Math.random().toString(36).slice(2)}`;
            let count = 0;

            const render = () => {
                const options = parseOptions(optionsWidget.value);
                const chosen = kind === "radio" ? [selectedWidget.value] : selectedWidget.value.split("\n");
                count = options.length;
                list.replaceChildren(...options.map((o) => {
                    const input = h("input");
                    input.type = kind;
                    input.name = group;
                    input.checked = chosen.includes(o.label);
                    const item = h("label", input.checked ? "objn-choice checked" : "objn-choice", input, h("span", "objn-choice-label", o.label));
                    if (o.value !== o.label) item.append(h("span", "objn-choice-value", o.value));
                    item.title = o.value;
                    input.onchange = () => {
                        const inputs = [...list.querySelectorAll("input")];
                        inputs.forEach((el) => el.parentElement.classList.toggle("checked", el.checked));
                        selectedWidget.value = kind === "radio"
                            ? o.label
                            : options.filter((_, i) => inputs[i].checked).map((opt) => opt.label).join("\n");
                        this.setDirtyCanvas(true, true);
                    };
                    return item;
                }));
                const editOptions = () => openOptionsEditor(this, () => {
                    const labels = parseOptions(optionsWidget.value).map((o) => o.label);
                    selectedWidget.value = kind === "radio"
                        ? (labels.includes(selectedWidget.value) ? selectedWidget.value : labels[0] ?? "")
                        : selectedWidget.value.split("\n").filter((l) => labels.includes(l)).join("\n");
                    render();
                });
                this.objnEditOptions = editOptions;
                const size = this.computeSize();
                this.setSize([Math.max(this.size[0], size[0], 240), size[1]]);
                this.setDirtyCanvas(true, true);
            };

            this.addDOMWidget("choices", "objn_selection", list, {
                serialize: false,
                getMinHeight: () => count * 34 + 10,
                onDraw: (widget) => {
                    // Keep the DOM overlay within the node, including after a resize.
                    widget.width = this.size[0];
                    list.style.maxWidth = `${Math.max(0, this.size[0] - widget.margin * 2)}px`;
                },
            });
            this.addTitleButton({ name: "objn_edit_options", text: "\ue942", xOffset: -10, yOffset: 0, fontSize: 16 });
            this.objnRenderSelection = render;
            render();
        };

        const onTitleButtonClick = nodeType.prototype.onTitleButtonClick;
        nodeType.prototype.onTitleButtonClick = function (button) {
            if (button.name === "objn_edit_options") this.objnEditOptions?.();
            else onTitleButtonClick?.apply(this, arguments);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
            this.objnRenderSelection?.();
        };
    },
});
