import { app } from "../../scripts/app.js";

function removeLegacySlotInput(node) {
    if (typeof node.removeInput !== "function") return;
    for (let index = (node.inputs?.length ?? 0) - 1; index >= 0; index--) {
        if (node.inputs[index]?.name === "slot") node.removeInput(index);
    }

    // Removing a legacy slot can shift input indexes. Drop any dangling links
    // left by old workflows while preserving links still attached to `value`.
    const graph = node.graph;
    const links = graph?.links;
    if (!links) return;
    const entries = links instanceof Map ? [...links.entries()] : Object.entries(links);
    for (const [id, link] of entries) {
        if (String(link.target_id) !== String(node.id)) continue;
        const input = node.inputs?.[link.target_slot];
        if (input && String(input.link) === String(id)) continue;
        if (typeof graph.removeLink === "function") graph.removeLink(id);
        else {
            if (links instanceof Map) links.delete(id);
            else delete links[id];
            const source = graph.getNodeById?.(link.origin_id) || graph._nodes?.find((candidate) => String(candidate.id) === String(link.origin_id));
            const sourceLinks = source?.outputs?.[link.origin_slot]?.links;
            if (Array.isArray(sourceLinks)) {
                source.outputs[link.origin_slot].links = sourceLinks.filter((sourceLink) => String(sourceLink) !== String(id));
            }
        }
    }
}

app.registerExtension({
    name: "objn.FlowOutputNamedPorts",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ObjnFlowOutput") return;
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
            const nameWidget = this.widgets?.find((widget) => widget.name === "name");
            if (nameWidget && /^\d+$/.test(String(nameWidget.value ?? ""))) {
                nameWidget.value = `out_${Math.max(1, Number(nameWidget.value))}`;
            }
            removeLegacySlotInput(this);
        };
    },
});
