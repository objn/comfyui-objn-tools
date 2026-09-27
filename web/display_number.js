import { app } from "../../scripts/app.js";
import { ensureStyle, h } from "./objn_ui.js";

app.registerExtension({
    name: "objn.DisplayNumber",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ObjnDisplayNumber") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            ensureStyle();
            this.objnDisplayValue = h("span", "objn-display-value", "Run to show the number");
            this.objnDisplay = h("div", "objn-display empty", this.objnDisplayValue);
            this.addDOMWidget("display", "objn_display", this.objnDisplay, {
                serialize: false,
                getMinHeight: () => 60,
                onDraw: (widget) => {
                    widget.width = this.size[0];
                    this.objnDisplay.style.maxWidth = `${Math.max(0, this.size[0] - widget.margin * 2)}px`;
                },
            });
            this.setSize([240, 120]);
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);
            this.objnDisplay.classList.remove("empty");
            this.objnDisplayValue.textContent = String(message.display_number?.[0]);
        };
    },
});
