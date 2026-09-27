import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "objn.PreviewAnySpacing",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "PreviewAny") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            // The built-in text preview and its mode toggle are adjacent widgets.
            // Increase the preview widget's inner margin so the two controls do
            // not appear pressed together in either node renderer.
            const previewWidget = this.widgets?.find((widget) => widget.name === "preview_text");
            if (previewWidget?.options) previewWidget.options.margin = 18;
        };
    },
});
