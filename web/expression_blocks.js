import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { h, hideWidget, openPanel } from "./objn_ui.js";

const ARITH = ["+", "-", "*", "/", "//", "%", "^"];
const COMPARE = ["==", "!=", "<", "<=", ">", ">="];
const LOGIC = ["and", "or", "not"];

const isNumber = (v) => /^-?\d*\.?\d+$/.test(v);
const kindOf = (t) => (t === "(" || t === ")" ? "paren" : ARITH.includes(t) ? "arith" : COMPARE.includes(t) ? "compare" : "logic");

function lex(text) {
    const src = text.replace(/\*\*/g, "^");
    const all = src.match(/\s+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\d*\.?\d+|[A-Za-z_]\w*|\/\/|==|!=|<=|>=|[-+*/%^()<>]/g) ?? [];
    if (all.join("") !== src) throw new Error("unsupported character");
    return all.filter((t) => !/^\s+$/.test(t));
}

function parse(tokens) {
    let i = 0;
    const eat = (...ops) => (ops.includes(tokens[i]) ? tokens[i++] : null);
    const binary = (next, ...ops) => () => {
        next();
        while (eat(...ops)) next();
    };

    const or = binary(() => and(), "or");
    const and = binary(() => not(), "and");
    const not = () => (eat("not") ? not() : cmp());
    const cmp = binary(() => add(), ...COMPARE);
    const add = binary(() => mul(), "+", "-");
    const mul = binary(() => unary(), "*", "/", "//", "%");
    const unary = () => (eat("-", "+") ? unary() : pow());
    const pow = () => {
        atom();
        if (eat("^")) unary();
    };
    const atom = () => {
        const tok = tokens[i++];
        if (tok === "(") {
            or();
            if (!eat(")")) throw new Error("missing )");
        } else if (tok === undefined || !/^(["'\d.]|[A-Za-z_])/.test(tok) || LOGIC.includes(tok)) {
            throw new Error(tok === undefined ? "expression ends too early" : `unexpected "${tok}"`);
        }
    };

    or();
    if (i < tokens.length) throw new Error(`unexpected "${tokens[i]}"`);
}

function toToken(tok) {
    if (tok[0] === '"') return { k: "val", v: JSON.parse(tok) };
    if (tok[0] === "'") return { k: "val", v: tok.slice(1, -1) };
    if (/^[\d.]/.test(tok)) return { k: "val", v: tok };
    if (/^[A-Za-z_]/.test(tok) && !LOGIC.includes(tok)) return { k: "var", v: tok };
    return { k: "op", v: tok };
}

const tokenText = (t) => (t.k === "val" && !isNumber(t.v) ? JSON.stringify(t.v) : t.v);

function toText(tokens) {
    return tokens.reduce((out, t, i) => {
        const text = tokenText(t);
        return out + (i === 0 || tokens[i - 1].v === "(" || text === ")" ? "" : " ") + text;
    }, "");
}

const WIDGET = { ObjnCalculator: "expression", ObjnCompare: "expression", ObjnRouter: "rules" };
const ROUTER_OUTPUTS = "output_types";
const ROUTER_INPUTS = "input_names";
const ROUTER_IMPORTED = "imported_flows";
const ROUTER_CUSTOM_INPUTS = "custom_inputs";
const NODE_INPUT_NAMES = "input_names";
const NODE_OUTPUT_CONFIG = "output_config";
const NODE_METHODS = "methods";

function expressionNodeConfigOf(inputNames, outputConfig, node, expression) {
    let inputs = {};
    let outputs = [];
    let hasInputConfig = false;
    try {
        if (inputNames != null && inputNames !== "") {
            inputs = JSON.parse(inputNames);
            hasInputConfig = true;
        }
    } catch { /* old nodes */ }
    try { outputs = JSON.parse(outputConfig || "[]"); } catch { /* old nodes */ }
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) inputs = {};
    if (!Array.isArray(outputs) || !outputs.length) outputs = [{ name: node.outputs?.[0]?.name || "out_1", method: "method_1" }];
    for (const input of node.inputs || []) {
        if (!input.name?.startsWith("values.")) continue;
        const slot = input.name.slice(7);
        if (!hasInputConfig || input.link != null) inputs[slot] ||= slot;
    }
    return { inputs, outputs: outputs.slice(0, 4).map((output, index) => ({
        name: String(output?.name || `out_${index + 1}`),
        method: String(output?.method || "method_1"),
    })) };
}

function syncExpressionNodeIO(node, config) {
    const slots = new Set(Object.keys(config.inputs).filter((slot) => /^[a-z]$/.test(slot)));
    for (const slot of slots) {
        if (node.inputs.some((input) => input.name === `values.${slot}`)) continue;
        const template = node.inputs.find((input) => input.name.startsWith("values."));
        node.addInput?.(`values.${slot}`, template?.type || "*", { shape: template?.shape, localized_name: config.inputs[slot] });
    }
    for (let index = (node.inputs?.length ?? 0) - 1; index >= 0; index--) {
        const input = node.inputs[index];
        if (input.name?.startsWith("values.") && !slots.has(input.name.slice(7))) node.removeInput(index);
    }
    const count = Math.max(1, Math.min(4, config.outputs.length));
    while ((node.outputs?.length ?? 0) < count) {
        const index = node.outputs.length;
        const template = node.outputs[0];
        node.addOutput?.(`out_${index + 1}`, template?.type || "*", { shape: template?.shape });
    }
    for (let index = (node.outputs?.length ?? 0) - 1; index >= count; index--) node.removeOutput?.(index);
    for (let index = 0; index < count; index++) {
        const output = node.outputs[index];
        if (output) output.label = config.outputs[index]?.name?.trim() || `out_${index + 1}`;
    }
    for (const input of node.inputs || []) {
        if (!input.name?.startsWith("values.")) continue;
        const slot = input.name.slice(7);
        input.label = config.inputs[slot] || slot;
    }
    node.setDirtyCanvas(true, true);
}

function routerOutputsOf(value, defaultCount = 1) {
    let outputs;
    try {
        outputs = JSON.parse(value);
    } catch {
        outputs = String(value || "").split(",").map((type) => ({ type: type.trim() }));
    }
    if (!Array.isArray(outputs)) outputs = [];
    return Array.from({ length: Math.max(1, defaultCount) }, (_, i) => ({
        name: String(outputs[i]?.name || `out_${i + 1}`),
        type: String(outputs[i]?.type || "*"),
    }));
}

function applyRouterOutputs(node, outputs) {
    for (const [i, output] of (node.outputs || []).entries()) {
        const config = outputs[i] || { name: `out_${i + 1}`, type: "*" };
        output.label = config.name.trim() || `out_${i + 1}`;
        output.type = config.type.trim() || "*";
    }
    node.setDirtyCanvas(true, true);
}

function syncRouterOutputSlots(node, count) {
    count = Math.max(1, Math.min(4, Number(count) || 1));
    while ((node.outputs?.length ?? 0) < count && typeof node.addOutput === "function") {
        const index = node.outputs.length;
        const template = node.outputs[0];
        node.addOutput(`out_${index + 1}`, template?.type || "*", { shape: template?.shape });
    }
    for (let index = (node.outputs?.length ?? 0) - 1; index >= count; index--) {
        if (node.outputs[index].links?.length) continue;
        node.removeOutput?.(index);
    }
    node.setDirtyCanvas(true, true);
}

function routerOutputCount(node) {
    let count = 1;
    for (let index = 0; index < (node.outputs?.length ?? 0); index++) {
        if (node.outputs[index].links?.length) count = index + 1;
    }
    return count;
}

function routerInputNamesOf(value, inputs) {
    let names = {};
    try {
        names = JSON.parse(value) || {};
    } catch {
        // Older Router workflows have no custom input names.
    }
    return inputs.reduce((result, input) => {
        const slot = input.name.slice("values.".length);
        result[slot] = String(names[slot] || slot);
        return result;
    }, {});
}

function mergedFlowInterface(selectedFlows, interfaces) {
    const inputs = new Map();
    const outputs = new Map();
    const errors = [];
    const isAnyType = (type) => !type || type === "*" || type === "COMFY_MATCHTYPE_V3";
    const addType = (map, key, type, label) => {
        const concrete = String(type || "*").split(",").map((part) => part.trim()).filter((part) => part && !isAnyType(part)).sort();
        type = concrete.join(",") || "*";
        const current = map.get(key);
        if (!current) {
            map.set(key, { type, source: label });
            return;
        }
        if (isAnyType(current.type)) {
            current.type = type;
            current.source = label;
        }
        else if (!isAnyType(type) && current.type !== type) {
            errors.push(`${label}: ${key} uses ${type}, but ${current.source} uses ${current.type}`);
        }
    };

    for (const flow of selectedFlows) {
        const info = interfaces[flow];
        if (!info) {
            errors.push(`${flow}: interface has not loaded`);
            continue;
        }
        if (info.error) {
            errors.push(`${flow}: ${info.error}`);
            continue;
        }
        for (const input of info.inputs || []) addType(inputs, input.name, input.type, flow);
        for (const [index, output] of (info.outputs || []).entries()) {
            const name = output.name || `out_${output.slot || index + 1}`;
            addType(outputs, String(name), output.type, flow);
        }
    }

    return {
        errors: [...new Set(errors)],
        inputs: [...inputs.entries()].map(([name, value]) => ({ name, type: value.type })),
        outputs: [...outputs.entries()].map(([name, value]) => ({ name, type: value.type })),
    };
}

function applyRouterInputNames(node, names) {
    for (const input of node.inputs || []) {
        if (!input.name.startsWith("values.")) continue;
        const slot = input.name.slice("values.".length);
        input.label = names[slot] || slot;
    }
    node.setDirtyCanvas(true, true);
}

function removeLegacyEditorSockets(node, nodeClass) {
    // These editor-only values used to create sockets. Old workflows retain
    // those sockets after the schema is corrected, so remove them on restore.
    const configInputs = new Set(["rules", "expression", ROUTER_OUTPUTS, ROUTER_INPUTS, ROUTER_IMPORTED, ROUTER_CUSTOM_INPUTS, NODE_OUTPUT_CONFIG, NODE_METHODS]);
    for (let i = (node.inputs?.length ?? 0) - 1; i >= 0; i--) {
        const name = node.inputs[i].name || "";
        const staleExpressionSocket = (nodeClass === "ObjnCalculator" || nodeClass === "ObjnCompare") && !name.startsWith("values.");
        if (staleExpressionSocket || configInputs.has(name)) node.removeInput(i);
    }
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
                const remaining = sourceLinks.filter((sourceLink) => String(sourceLink) !== String(id));
                source.outputs[link.origin_slot].links = remaining;
            }
        }
    }
}

function dedupeRouterInputSlots(node) {
    if (typeof node.removeInput !== "function") return;
    const kept = new Map();
    const duplicates = [];
    for (let index = 0; index < (node.inputs?.length ?? 0); index++) {
        const input = node.inputs[index];
        if (!input.name?.startsWith("values.")) continue;
        const slot = input.name.slice("values.".length);
        if (!kept.has(slot)) { kept.set(slot, index); continue; }
        const prior = kept.get(slot);
        if (input.link != null && node.inputs[prior].link == null) {
            duplicates.push(prior);
            kept.set(slot, index);
        } else duplicates.push(index);
    }
    for (const index of duplicates.sort((a, b) => b - a)) node.removeInput(index);
}

function pruneImportedRouterInputs(node) {
    const importedWidget = node.widgets?.find((widget) => widget.name === ROUTER_IMPORTED);
    let importedFlows = [];
    try { importedFlows = JSON.parse(importedWidget?.value || "[]"); } catch { /* older Router node */ }
    if (!Array.isArray(importedFlows) || !importedFlows.length || typeof node.removeInput !== "function") return;

    const namesWidget = node.widgets?.find((widget) => widget.name === ROUTER_INPUTS);
    let names = {};
    try { names = JSON.parse(namesWidget?.value || "{}") || {}; } catch { /* older Router node */ }
    const configuredSlots = Object.keys(names).filter((slot) => /^[a-z]$/.test(slot));
    const desiredSlots = new Set(configuredSlots);
    for (const input of node.inputs) {
        if (!input.name?.startsWith("values.") || input.link == null) continue;
        const slot = input.name.slice("values.".length);
        if (/^[a-z]$/.test(slot)) desiredSlots.add(slot);
    }
    const highestConfigured = configuredSlots.reduce((highest, slot) => Math.max(highest, slot.charCodeAt(0) - 97), -1);
    for (let index = (node.inputs?.length ?? 0) - 1; index >= 0; index--) {
        const input = node.inputs[index];
        if (!input.name?.startsWith("values.") || input.link != null) continue;
        const slot = input.name.slice("values.".length);
        const slotIndex = /^[a-z]$/.test(slot) ? slot.charCodeAt(0) - 97 : -1;
        if (slotIndex < 0 || slotIndex <= highestConfigured || desiredSlots.has(slot)) continue;
        node.removeInput(index);
    }
}

function tokensOf(text) {
    try {
        return lex(text).map(toToken);
    } catch {
        return [];
    }
}

function parseRules(text) {
    const rules = [];
    let elseFlow = "";
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        const at = line.lastIndexOf("=>");
        if (!line || line.startsWith("#") || at < 0) continue;
        const condition = line.slice(0, at).trim();
        const flow = line.slice(at + 2).trim();
        if (condition === "else") elseFlow = flow;
        else rules.push({ tokens: tokensOf(condition), flow });
    }
    return { rules, elseFlow };
}

async function openEditor(node, nodeClass = node.comfyClass) {
    const widget = node.widgets?.find((w) => w.name === WIDGET[nodeClass]);
    if (!widget) {
        console.error(`[objn] Cannot open ${nodeClass}: expression widget was not found`, node);
        return;
    }
    const isRouter = nodeClass === "ObjnRouter";
    const inputNamesWidget = !isRouter && node.widgets.find((w) => w.name === NODE_INPUT_NAMES);
    const outputConfigWidget = !isRouter && node.widgets.find((w) => w.name === NODE_OUTPUT_CONFIG);
    const methodsWidget = !isRouter && node.widgets.find((w) => w.name === NODE_METHODS);
    const nodeIO = !isRouter ? expressionNodeConfigOf(inputNamesWidget?.value, outputConfigWidget?.value, node, widget.value) : null;
    const outputWidget = isRouter && node.widgets.find((w) => w.name === ROUTER_OUTPUTS);
    const inputWidget = isRouter && node.widgets.find((w) => w.name === ROUTER_INPUTS);
    const importWidget = isRouter && node.widgets.find((w) => w.name === ROUTER_IMPORTED);
    const customInputsWidget = isRouter && node.widgets.find((w) => w.name === ROUTER_CUSTOM_INPUTS);
    const routerOutputs = outputWidget ? routerOutputsOf(outputWidget.value) : [];
    const routerInputs = isRouter ? routerInputNamesOf(inputWidget.value, node.inputs.filter((i) => i.name.startsWith("values."))) : {};
    let names = node.inputs.filter((i) => i.name.startsWith("values.") && i.link != null).map((i) => routerInputs[i.name.slice(7)]);
    if (nodeIO) names = Object.values(nodeIO.inputs);
    const flows = isRouter ? await (await api.fetchApi("/objn/flows")).json() : [];
    let importedFlows = [];
    try { importedFlows = JSON.parse(importWidget?.value || "[]"); } catch { /* older Router node */ }
    if (!Array.isArray(importedFlows)) importedFlows = [];
    let customInputs = [];
    try { customInputs = JSON.parse(customInputsWidget?.value || "[]"); } catch { /* older Router node */ }
    if (!Array.isArray(customInputs)) customInputs = [];
    customInputs = customInputs.map((item) => typeof item === "string"
        ? { name: item, slot: null }
        : { name: String(item?.name || ""), slot: Number.isInteger(item?.slot) ? item.slot : null })
        .filter((item) => item.name);
    if (!importedFlows.length) routerOutputs.splice(routerOutputCount(node));
    let flowInterfaces = {};
    if (importedFlows.length) {
        const query = new URLSearchParams(importedFlows.map((flow) => ["flow", flow]));
        try { flowInterfaces = await (await api.fetchApi(`/objn/flow-interfaces?${query}`)).json(); } catch { /* show import error in the editor */ }
    }
    let methods = [];
    try { methods = JSON.parse(methodsWidget?.value || "[]"); } catch { /* previous node version */ }
    if (!Array.isArray(methods) || !methods.length) methods = [{ id: "method_1", name: "Method 1", expression: widget.value || "0" }];
    methods = methods.slice(0, 12).map((method, index) => ({
        id: String(method?.id || `method_${index + 1}`),
        name: String(method?.name || `Method ${index + 1}`),
        expression: String(method?.expression || "0"),
    }));
    let { rules, elseFlow } = isRouter ? parseRules(widget.value) : {
        rules: methods.map((method) => ({ tokens: tokensOf(method.expression) })),
        elseFlow: "",
    };
    if (!rules.length) rules.push({ tokens: [], flow: "" });
    let active = 0;
    let drag = null;

    const list = h("div", isRouter ? "objn-rules" : "objn-rules single");
    const preview = h("input", "objn-input");
    preview.spellcheck = false;
    preview.placeholder = isRouter ? "Condition of the selected rule, e.g. a > 5" : "Type an expression, e.g. (a + b) * 2";
    const message = h("span", "objn-msg");
    const foot = h("div", "objn-foot", preview, message);
    const palette = h("div", "objn-palette");
    let routerTabBar;
    const routerTabButtons = [];
    let selectRouterTab = () => {};
    let activeSchema = isRouter ? mergedFlowInterface(importedFlows, flowInterfaces) : { inputs: [], outputs: [], errors: [] };
    let importIssues = activeSchema.errors;
    if (importedFlows.length && !importIssues.length) {
        const importedCount = activeSchema.inputs.length;
        for (const slot of Object.keys(routerInputs)) {
            const index = /^[a-z]$/.test(slot) ? slot.charCodeAt(0) - 97 : -1;
            const connected = node.inputs.some((input) => input.name === `values.${slot}` && input.link != null);
            if (index >= importedCount && !connected) delete routerInputs[slot];
        }
    }
    const inputConfig = isRouter ? h("div", "objn-tab-panel objn-output-config") : null;
    const outputConfig = isRouter ? h("div", "objn-tab-panel objn-output-config") : null;
    const importConfig = isRouter ? h("div", "objn-tab-panel objn-import-panel") : null;

    function slotName(index) { return String.fromCharCode(97 + index); }

    const pendingDeletedInputs = new Set();

    function nextCustomSlot() {
        let next = activeSchema.inputs.length;
        for (const input of node.inputs) {
            if (!input.name?.startsWith("values.") || input.link == null) continue;
            const slot = input.name.slice(7);
            const index = /^[a-z]$/.test(slot) ? slot.charCodeAt(0) - 97 : -1;
            if (index >= 0 && !customInputs.some((item) => item.slot === index)) next = Math.max(next, index + 1);
        }
        for (const item of customInputs) {
            if (Number.isInteger(item.slot)) next = Math.max(next, item.slot + 1);
        }
        return next;
    }

    function normalizeCustomInputSlots() {
        const used = new Set(activeSchema.inputs.map((_, index) => index));
        let next = activeSchema.inputs.length;
        for (const input of node.inputs) {
            if (!input.name?.startsWith("values.") || input.link == null) continue;
            const slot = input.name.slice(7);
            const index = /^[a-z]$/.test(slot) ? slot.charCodeAt(0) - 97 : -1;
            if (index >= activeSchema.inputs.length && !customInputs.some((item) => item.slot === index)) next = Math.max(next, index + 1);
        }
        for (const item of customInputs) {
            if (!Number.isInteger(item.slot) || used.has(item.slot)) {
                const oldSlot = Number.isInteger(item.slot) ? slotName(item.slot) : null;
                if (oldSlot && node.inputs.some((input) => input.name === `values.${oldSlot}`)) pendingDeletedInputs.add(oldSlot);
                item.slot = next;
                next += 1;
            }
            used.add(item.slot);
            routerInputs[slotName(item.slot)] = item.name;
        }
    }

    for (const item of customInputs) {
        if (!Number.isInteger(item.slot)) {
            const matchingSlot = Object.entries(routerInputs).find(([slot, name]) =>
                name === item.name && /^[a-z]$/.test(slot) && slot.charCodeAt(0) - 97 >= activeSchema.inputs.length);
            item.slot = matchingSlot ? matchingSlot[0].charCodeAt(0) - 97 : nextCustomSlot();
        }
        routerInputs[slotName(item.slot)] = item.name;
    }
    normalizeCustomInputSlots();

    function refreshRouterNames() {
        const importedSlots = new Set(activeSchema.inputs.map((_, index) => slotName(index)));
        const extraSlots = new Set(customInputs.map((item) => slotName(item.slot)));
        names = [
            ...activeSchema.inputs.map((input, index) => routerInputs[slotName(index)] || input.name),
            ...node.inputs.filter((input) => input.name.startsWith("values.") && input.link != null)
                .map((input) => input.name.slice(7))
                .filter((slot) => !importedSlots.has(slot) && !extraSlots.has(slot))
                .map((slot) => routerInputs[slot] || slot),
            ...customInputs.map((item) => item.name),
        ].filter((name, index, all) => name && all.indexOf(name) === index);
    }

    function ensureInputSlots() {
        for (let index = node.inputs.length - 1; index >= 0; index--) {
            const input = node.inputs[index];
            if (input.name?.startsWith("values.") && pendingDeletedInputs.has(input.name.slice(7))) node.removeInput(index);
        }
        pendingDeletedInputs.clear();
        const required = new Set(activeSchema.inputs.map((_, index) => index));
        for (const item of customInputs) required.add(item.slot);
        for (const input of node.inputs) {
            if (!input.name?.startsWith("values.") || input.link == null) continue;
            const slot = input.name.slice(7);
            const index = /^[a-z]$/.test(slot) ? slot.charCodeAt(0) - 97 : -1;
            if (index >= 0) required.add(index);
        }
        if ([...required].some((index) => index < 0 || index >= 26)) return false;
        const existing = new Set(node.inputs.filter((input) => input.name.startsWith("values.")).map((input) => input.name.slice(7)));
        for (const index of required) {
            const slot = slotName(index);
            if (existing.has(slot)) continue;
            if (typeof node.addInput !== "function") return false;
            const template = node.inputs.find((input) => input.name === "values.a");
            node.addInput(`values.${slot}`, "*", { shape: template?.shape, localized_name: slot });
            existing.add(slot);
            routerInputs[slot] ||= slot;
        }
        for (let index = node.inputs.length - 1; index >= 0; index--) {
            const input = node.inputs[index];
            if (!input.name.startsWith("values.") || input.link != null) continue;
            const slot = input.name.slice(7);
            const slotIndex = /^[a-z]$/.test(slot) ? slot.charCodeAt(0) - 97 : -1;
            if (slotIndex >= 0 && !required.has(slotIndex)) {
                node.removeInput(index);
                delete routerInputs[slot];
            }
        }
        return true;
    }

    function applyImportedInterface() {
        if (importIssues.length) return;
        if (activeSchema.inputs.length > 26) importIssues = ["Router supports up to 26 imported inputs."];
        if (activeSchema.outputs.length > 4) importIssues.push("Router supports up to 4 named outputs.");
        if (importIssues.length) return;
        activeSchema.inputs.forEach((input, index) => { routerInputs[slotName(index)] ||= input.name; });
        activeSchema.outputs.forEach((output, index) => {
            while (routerOutputs.length <= index) routerOutputs.push({ name: output.name, type: "*" });
            const target = routerOutputs[index];
            if (target) {
                target.name = output.name;
                target.type = output.type;
            }
        });
        if (importedFlows.length && activeSchema.outputs.length) {
            routerOutputs.splice(activeSchema.outputs.length);
        } else if (importedFlows.length) routerOutputs.splice(1);
        syncRouterOutputSlots(node, routerOutputs.length);
        applyRouterOutputs(node, routerOutputs);
    }

    function renderInputConfig() {
        if (!inputConfig) return;
        const connectedSlots = new Set(node.inputs.filter((input) => input.name.startsWith("values.") && input.link != null).map((input) => input.name.slice(7)));
        const importedSlots = new Set(activeSchema.inputs.map((_, index) => slotName(index)));
        const customEntries = customInputs.map((item, index) => [slotName(item.slot), item.name, "*", index]);
        const linkedEntries = [...connectedSlots]
            .filter((slot) => !importedSlots.has(slot) && !customEntries.some(([customSlot]) => customSlot === slot))
            .map((slot) => [slot, routerInputs[slot] || slot, "*"]);
        const entries = [
            ...(importedFlows.length ? activeSchema.inputs.map((input, index) => [slotName(index), input.name, input.type]) : []),
            ...(!importedFlows.length ? Object.entries(routerInputs)
                .filter(([slot, name]) => (connectedSlots.has(slot) || name !== slot) && !customEntries.some(([customSlot]) => customSlot === slot))
                .map(([slot, name]) => [slot, name, "*"]) : []),
            ...(importedFlows.length ? linkedEntries : []),
            ...customEntries,
        ];
        inputConfig.replaceChildren(h("div", "objn-label objn-output-config-title", "Flow inputs"));
        if (!entries.length) inputConfig.append(h("div", "objn-placeholder", "Import a workflow or add an input."));
        for (const [slot, value, typeValue, customIndex] of entries) {
            const name = h("input", "objn-input");
            name.value = importIssues.length ? value : (routerInputs[slot] || value);
            name.oninput = () => {
                const previous = routerInputs[slot] || value;
                routerInputs[slot] = name.value;
                if (customIndex !== undefined) customInputs[customIndex].name = name.value;
                if (previous !== name.value) {
                    for (const rule of rules) {
                        for (const token of rule.tokens) {
                            if (token.k === "var" && token.v === previous) token.v = name.value;
                        }
                    }
                }
                refreshRouterNames();
                renderPalette();
                refresh();
            };
            const type = h("span", "objn-type-badge", typeValue);
            if (customIndex === undefined) inputConfig.append(h("div", "objn-input-config-row", name, type));
            else {
                const remove = h("button", "objn-x", "\u00D7");
                remove.title = "Delete input";
                remove.onclick = () => {
                    const custom = customInputs[customIndex];
                    if (!custom) return;
                    const oldName = custom.name;
                    const customSlot = slotName(custom.slot);
                    customInputs.splice(customIndex, 1);
                    delete routerInputs[customSlot];
                    if (node.inputs.some((input) => input.name === `values.${customSlot}`)) pendingDeletedInputs.add(customSlot);
                    for (const rule of rules) rule.tokens = rule.tokens.filter((token) => token.k !== "var" || token.v !== oldName);
                    refreshRouterNames();
                    renderInputConfig();
                    renderPalette();
                    refresh();
                };
                inputConfig.append(h("div", "objn-input-config-row objn-input-config-custom", name, type, remove));
            }
        }
        const addInput = h("button", "objn-btn ghost objn-input-add", "+ Add input");
        addInput.onclick = () => {
            let index = customInputs.length + 1;
            const used = new Set([...names, ...customInputs.map((item) => item.name)]);
            let name = `input_${index}`;
            while (used.has(name)) name = `input_${++index}`;
            const slotIndex = nextCustomSlot();
            const slot = slotName(slotIndex);
            customInputs.push({ name, slot: slotIndex });
            routerInputs[slot] = name;
            refreshRouterNames();
            renderInputConfig();
            renderPalette();
            refresh();
        };
        addInput.disabled = nextCustomSlot() >= 26;
        inputConfig.append(addInput);
    }

    function renderOutputConfig() {
        if (!outputConfig) return;
        const count = routerOutputs.length;
        outputConfig.replaceChildren(
            h("div", "objn-label objn-output-config-title", "Flow outputs"),
            h("div", "objn-output-config-row objn-output-config-head", h("span", "objn-label", "Name"), h("span", "objn-label", "Type")),
        );
        if (!count) outputConfig.append(h("div", "objn-placeholder", "Select a workflow in Import to view its outputs."));
        for (let i = 0; i < count; i++) {
            const output = routerOutputs[i];
            const name = h("input", "objn-input");
            name.value = output.name;
            name.placeholder = `Output ${i + 1} name`;
            name.oninput = () => { output.name = name.value; };
            const type = h("input", "objn-input");
            type.value = output.type;
            type.placeholder = "* (any type)";
            type.oninput = () => { output.type = type.value; };
            outputConfig.append(h("div", "objn-output-config-row", name, type));
        }
    }

    function renderImportConfig() {
        if (!importConfig) return;
        const flowList = h("div", "objn-import-list");
        const flowChoices = [...flows, ...importedFlows.filter((flow) => !flows.includes(flow))];
        for (const flow of flowChoices) {
            const checkbox = h("input");
            checkbox.type = "checkbox";
            checkbox.checked = importedFlows.includes(flow);
            checkbox.onchange = () => { handleImportChange(flow, checkbox.checked); };
            flowList.append(h("label", "objn-import-row", checkbox, h("span", "objn-import-name", `${flow}${flows.includes(flow) ? "" : " (missing)"}`)));
        }
        const status = h("div", importIssues.length ? "objn-msg" : "objn-hint");
        status.textContent = [...importIssues, ...Object.entries(flowInterfaces)
            .filter(([, info]) => info?.error)
            .map(([name, info]) => `${name}: ${info.error}`)].join("; ") || (importedFlows.length
            ? `${importedFlows.length} workflow(s) selected. Matching input and output names must use the same type.`
            : "Select one or more saved workflows to import their Flow Input and Flow Output interface.");
        importConfig.replaceChildren(h("div", "objn-label objn-output-config-title", "Import workflows"), flowList, status);
    }

    let importRevision = 0;
    async function handleImportChange(flow, checked) {
        const previousSchema = activeSchema;
        const previousInputNames = { ...routerInputs };
        importedFlows = checked
            ? [...new Set([...importedFlows, flow])]
            : importedFlows.filter((name) => name !== flow);
        const revision = ++importRevision;
        const selected = [...importedFlows];
        importIssues = [];
        flowInterfaces = {};
        if (selected.length) {
            const query = new URLSearchParams(selected.map((name) => ["flow", name]));
            try {
                flowInterfaces = await (await api.fetchApi(`/objn/flow-interfaces?${query}`)).json();
            } catch (error) {
                importIssues = [`Could not load workflow interfaces: ${error.message}`];
            }
        }
        if (revision !== importRevision) return;
        activeSchema = mergedFlowInterface(selected, flowInterfaces);
        importIssues.push(...activeSchema.errors);
        if (selected.length) {
            const aliasesByName = new Map(previousSchema.inputs.map((input, index) => [input.name, previousInputNames[slotName(index)] || input.name]));
            const nextNames = {};
            activeSchema.inputs.forEach((input, index) => {
                const slot = slotName(index);
                nextNames[slot] = aliasesByName.get(input.name) || input.name;
            });
            for (const input of node.inputs.filter((item) => item.name.startsWith("values.") && item.link != null)) {
                const slot = input.name.slice(7);
                if (customInputs.some((custom) => custom.name === previousInputNames[slot])) continue;
                if (!Object.hasOwn(nextNames, slot)) nextNames[slot] = previousInputNames[slot] || slot;
            }
            for (const slot of Object.keys(routerInputs)) delete routerInputs[slot];
            Object.assign(routerInputs, nextNames);
        } else {
            for (const slot of Object.keys(routerInputs)) {
                if (!node.inputs.some((input) => input.name === `values.${slot}` && input.link != null)) delete routerInputs[slot];
            }
            routerOutputs.splice(1);
            syncRouterOutputSlots(node, 1);
        }
        applyImportedInterface();
        if (!importIssues.length) {
            for (const [index, input] of previousSchema.inputs.entries()) {
                const slot = slotName(index);
                const oldName = previousInputNames[slot];
                const newSlot = activeSchema.inputs.findIndex((next) => next.name === input.name);
                const newName = newSlot >= 0 ? routerInputs[slotName(newSlot)] : undefined;
                if (!oldName || !newName || oldName === newName) continue;
                for (const rule of rules) {
                    for (const token of rule.tokens) {
                        if (token.k === "var" && token.v === oldName) token.v = newName;
                    }
                }
            }
        }
        normalizeCustomInputSlots();
        refreshRouterNames();
        renderInputConfig();
        renderOutputConfig();
        renderImportConfig();
        renderPalette();
        refresh();
    }

    applyImportedInterface();
    refreshRouterNames();
    renderInputConfig();
    renderOutputConfig();
    renderImportConfig();
    const methodBar = !isRouter ? h("div", "objn-method-tabs") : null;
    const work = h("div", "objn-work",
        h("div", "objn-label", isRouter ? "Rules \u00B7 the first true condition runs its flow" : "Expression - syntax is checked when you press Apply"),
        ...(methodBar ? [methodBar] : []),
        list,
    );

    let nodeIOControls;
    function renderNodeIOControls() {
        if (!nodeIOControls || !nodeIO) return;
        const inputSection = h("section", "objn-io-section", h("div", "objn-label", "Inputs"));
        for (const slot of Object.keys(nodeIO.inputs).sort()) {
            const name = h("input", "objn-input");
            name.value = nodeIO.inputs[slot];
            name.oninput = () => {
                const previous = nodeIO.inputs[slot];
                nodeIO.inputs[slot] = name.value;
                for (const rule of rules) {
                    for (const token of rule.tokens) {
                        if (token.k === "var" && token.v === previous) token.v = name.value;
                    }
                }
                if (rules[0]) {
                    widget.value = toText(rules[0].tokens);
                    preview.value = widget.value;
                }
                names = Object.values(nodeIO.inputs);
                renderPalette();
            };
            name.onchange = renderNodeIOControls;
            const remove = h("button", "objn-x", "\u00D7");
            remove.title = `Delete input ${nodeIO.inputs[slot]}`;
            remove.onclick = () => {
                delete nodeIO.inputs[slot];
                names = Object.values(nodeIO.inputs);
                renderNodeIOControls();
                renderPalette();
            };
            inputSection.append(h("div", "objn-io-row objn-io-input-row", name, remove));
        }
        const addInput = h("button", "objn-btn ghost", "+ Add input");
        addInput.disabled = Object.keys(nodeIO.inputs).length >= 26;
        addInput.onclick = () => {
            const slot = Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index)).find((candidate) => !(candidate in nodeIO.inputs));
            if (!slot) return;
            nodeIO.inputs[slot] = slot;
            names = Object.values(nodeIO.inputs);
            renderNodeIOControls();
            renderPalette();
        };
        inputSection.append(addInput);

        const outputSection = h("section", "objn-io-section", h("div", "objn-label", "Outputs"));
        nodeIO.outputs.forEach((output, index) => {
            const name = h("input", "objn-input");
            name.value = output.name;
            name.oninput = () => { output.name = name.value; };
            const method = h("select", "objn-select");
            for (const item of methods) method.append(new Option(item.name, item.id));
            if (!methods.some((item) => item.id === output.method)) output.method = methods[0]?.id || "method_1";
            method.value = output.method;
            method.onchange = () => { output.method = method.value; };
            const remove = h("button", "objn-x", "\u00D7");
            remove.title = `Delete output ${output.name}`;
            remove.disabled = nodeIO.outputs.length <= 1;
            remove.onclick = () => { nodeIO.outputs.splice(index, 1); renderNodeIOControls(); };
            outputSection.append(h("div", "objn-io-row", name, method, remove));
        });
        const addOutput = h("button", "objn-btn ghost", "+ Add output");
        addOutput.disabled = nodeIO.outputs.length >= 4;
        addOutput.onclick = () => {
            nodeIO.outputs.push({ name: `out_${nodeIO.outputs.length + 1}`, method: methods[0]?.id || "method_1" });
            renderNodeIOControls();
        };
        outputSection.append(addOutput, h("div", "objn-hint", "Choose which expression method feeds each output."));
        nodeIOControls.replaceChildren(inputSection, outputSection);
    }
    if (!isRouter) {
        nodeIOControls = h("div", "objn-io-controls");
        work.prepend(nodeIOControls);
        renderNodeIOControls();
    }

    if (isRouter) {
        const rulesPanel = h("div", "objn-tab-panel objn-rules-panel", h("div", "objn-label", "Rules - the first true condition runs its flow"), list);
        const tabBar = h("div", "objn-section-tabs");
        routerTabBar = tabBar;
        ["Input", "Output", "Rules", "Import"].forEach((label, index) => {
            const tab = h("button", "objn-section-tab", label);
            tab.type = "button";
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", String(index === 0));
            tab.classList.toggle("active", index === 0);
            tab.onclick = () => selectRouterTab(index);
            routerTabButtons.push(tab);
            tabBar.append(tab);
        });
        tabBar.setAttribute("role", "tablist");
        work.replaceChildren(tabBar, rulesPanel);
    }

    function flowSelect(value, onChange, noneLabel) {
        const select = h("select", "objn-select");
        select.append(new Option(noneLabel, ""));
        const choices = importedFlows.length ? importedFlows : flows;
        for (const f of choices) select.append(new Option(f, f));
        if (value && !choices.includes(value)) select.append(new Option(`${value} (${importedFlows.length ? "not imported" : "missing"})`, value));
        select.value = value;
        select.onchange = () => onChange(select.value);
        return select;
    }

    function renderMethods() {
        if (!methodBar || !nodeIO) return;
        methodBar.replaceChildren(...methods.map((method, index) => {
            const tab = h("button", `objn-method-tab${index === active ? " active" : ""}`, method.name);
            tab.type = "button";
            tab.onclick = () => { active = index; refresh(); };
            return tab;
        }));
        const add = h("button", "objn-btn ghost", "+ Add method");
        add.disabled = methods.length >= 12;
        add.onclick = () => {
            let index = 1;
            while (methods.some((method) => method.id === `method_${index}`)) index++;
            methods.push({ id: `method_${index}`, name: `Method ${index}`, expression: "0" });
            rules.push({ tokens: [{ k: "val", v: "0" }] });
            active = rules.length - 1;
            renderMethods();
            renderNodeIOControls();
            refresh();
        };
        const remove = h("button", "objn-x", "\u00D7");
        remove.title = "Delete selected method";
        remove.disabled = methods.length <= 1;
        remove.onclick = () => {
            const removed = methods[active];
            methods.splice(active, 1);
            rules.splice(active, 1);
            for (const output of nodeIO.outputs) if (output.method === removed.id) output.method = methods[0].id;
            active = Math.max(0, Math.min(active, methods.length - 1));
            renderMethods();
            renderNodeIOControls();
            refresh();
        };
        methodBar.append(add, remove);
    }

    function refresh(typing) {
        if (!isRouter) renderMethods();
        list.replaceChildren(...(isRouter ? rules.map(ruleRow) : rules[active] ? [ruleRow(rules[active], active)] : []));
        if (isRouter) {
            const add = h("button", "objn-btn ghost", "+ Add rule");
            add.style.alignSelf = "flex-start";
            add.onclick = () => {
                rules.push({ tokens: [], flow: "" });
                active = rules.length - 1;
                refresh();
            };
            list.append(add, h("div", "objn-rule", h("span", "objn-tag", "ELSE"), h("span", "objn-tag", "\u2192"), flowSelect(elseFlow, (v) => (elseFlow = v), "(none)")));
            if (!flows.length) list.append(h("div", "objn-placeholder", "No workflows found. Save a workflow as .json in ComfyUI/user/default/workflows (or a subfolder) and reopen this editor."));
        }
        showError("");
        if (!typing) preview.value = toText(rules[active]?.tokens ?? []);
        preview.disabled = !rules[active];
    }

    function ruleRow(rule, r) {
        const line = h("div", "objn-line");
        line.classList.toggle("active", r === active);
        line.append(...rule.tokens.map((t, index) => block(t, r, index)));
        if (!rule.tokens.length) line.append(h("span", "objn-placeholder", "Click or drag blocks here"));
        line.addEventListener("mousedown", () => {
            if (active === r) return;
            active = r;
            list.querySelectorAll(".objn-line").forEach((el, i) => el.classList.toggle("active", i === r));
            preview.value = toText(rule.tokens);
            showError("");
        });
        line.addEventListener("dragover", (e) => {
            if (!drag) return;
            e.preventDefault();
            clearMarks();
            line.classList.add("over");
            const index = insertIndex(e, line, rule.tokens);
            if (index < rule.tokens.length) line.children[index].classList.add("before");
            else line.classList.add("end");
        });
        line.addEventListener("dragleave", (e) => e.target === line && clearMarks());
        line.addEventListener("drop", (e) => {
            e.preventDefault();
            clearMarks();
            let index = insertIndex(e, line, rule.tokens);
            const moved = drag.make ? drag.make() : rules[drag.row].tokens.splice(drag.index, 1)[0];
            if (drag.row === r && drag.index < index) index--;
            rule.tokens.splice(index, 0, moved);
            drag = null;
            active = r;
            refresh();
        });
        if (!isRouter) return h("div", "objn-rule", line);

        const remove = h("button", "objn-x", "\u00D7");
        remove.title = "Delete rule";
        remove.onclick = () => {
            rules.splice(r, 1);
            active = Math.max(0, Math.min(active, rules.length - 1));
            refresh();
        };
        return h("div", "objn-rule", h("span", "objn-tag", r === 0 ? "IF" : "ELIF"), line, h("span", "objn-tag", "\u2192"), flowSelect(rule.flow, (v) => (rule.flow = v), "(none)"), remove);
    }

    function showError(text) {
        foot.classList.toggle("error", text !== "");
        message.textContent = text;
    }

    preview.addEventListener("input", () => {
        try {
            rules[active].tokens = lex(preview.value).map(toToken);
        } catch (err) {
            showError(err.message);
            return;
        }
        refresh(true);
    });

    function clearMarks() {
        list.querySelectorAll(".over,.end").forEach((el) => el.classList.remove("over", "end"));
        list.querySelectorAll(".before").forEach((el) => el.classList.remove("before"));
    }

    function insertIndex(e, line, tokens) {
        const blocks = [...line.querySelectorAll(":scope > .objn-block")];
        const index = blocks.findIndex((el) => {
            const r = el.getBoundingClientRect();
            return e.clientY < r.top || (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2);
        });
        return index === -1 ? tokens.length : index;
    }

    function block(t, row, index) {
        const el = h("div", "objn-block");
        el.dataset.kind = t.k === "op" ? kindOf(t.v) : t.k;
        el.draggable = true;
        el.addEventListener("dragstart", (e) => {
            drag = { row, index };
            e.dataTransfer.setData("text/plain", "");
        });
        el.addEventListener("dragend", () => {
            drag = null;
            clearMarks();
        });
        if (t.k === "val") {
            const input = h("input");
            input.value = t.v;
            input.onfocus = () => (el.draggable = false);
            input.onblur = () => (el.draggable = true);
            input.oninput = () => {
                t.v = input.value;
                if (row === active) preview.value = toText(rules[row].tokens);
            };
            el.append(input);
        } else {
            el.append(t.v);
        }
        const x = h("button", "objn-x", "\u00D7");
        x.title = "Delete";
        x.onclick = () => {
            rules[row].tokens.splice(index, 1);
            active = row;
            refresh();
        };
        el.append(x);
        return el;
    }

    function chip(label, kind, make) {
        const el = h("div", "objn-block objn-chip", label);
        el.dataset.kind = kind;
        el.draggable = true;
        el.addEventListener("dragstart", (e) => {
            drag = { make };
            e.dataTransfer.setData("text/plain", "");
        });
        el.addEventListener("dragend", () => {
            drag = null;
            clearMarks();
        });
        el.onclick = () => {
            if (!rules[active]) return;
            rules[active].tokens.push(make());
            refresh();
        };
        return el;
    }

    const opChip = (op) => chip(op, kindOf(op), () => ({ k: "op", v: op }));
    palette.append(
        h("div", "objn-label", "Values"),
        chip("Value", "val", () => ({ k: "val", v: "0" })),
        ...names.map((n) => chip(n, "var", () => ({ k: "var", v: n }))),
        h("div", "objn-label", "Math"),
        ...ARITH.map(opChip),
        opChip("("),
        opChip(")"),
    );
    if (nodeClass !== "ObjnCalculator") {
        palette.append(h("div", "objn-label", "Compare"), ...COMPARE.map(opChip), h("div", "objn-label", "Logic"), ...LOGIC.map(opChip));
    }
    palette.append(h("div", "objn-hint", isRouter
        ? "Click a rule to select it. Click a block to add it to the selected rule, or drag it to any position. Use \u00D7 to delete."
        : "Click a block to add it at the end, or drag it to any position. Use \u00D7 to delete a block."));

    let panelContent = [h("div", "objn-body", palette, work), foot];
    if (isRouter) {
        const sidebar = h("aside", "objn-router-sidebar");
        const main = h("section", "objn-router-main");
        const sidebarViews = [h("div"), h("div"), palette, h("div")];
        const mainViews = [inputConfig, outputConfig, work.children[1], importConfig];
        selectRouterTab = (index) => {
            routerTabButtons.forEach((tab, i) => {
                tab.classList.toggle("active", i === index);
                tab.setAttribute("aria-selected", String(i === index));
            });
            sidebar.replaceChildren(sidebarViews[index]);
            main.replaceChildren(mainViews[index]);
            foot.hidden = index !== 2;
            if (index !== 2) showError("");
        };
        const body = h("div", "objn-body objn-router-body", sidebar, main);
        selectRouterTab(0);
        panelContent = [routerTabBar, body, foot];
    }

    function renderPalette() {
        palette.replaceChildren(
            h("div", "objn-label", "Values"),
            chip("Value", "val", () => ({ k: "val", v: "0" })),
            ...[...new Set(names.filter(Boolean))].map((name) => chip(name, "var", () => ({ k: "var", v: name }))),
            h("div", "objn-label", "Math"),
            ...ARITH.map(opChip),
            opChip("("),
            opChip(")"),
            ...(nodeClass !== "ObjnCalculator" ? [h("div", "objn-label", "Compare"), ...COMPARE.map(opChip), h("div", "objn-label", "Logic"), ...LOGIC.map(opChip)] : []),
            h("div", "objn-hint", isRouter
                ? "Click a rule to select it. Click a block to add it to the selected rule, or drag it to any position. Use \u00D7 to delete."
                : "Click a block to add it at the end, or drag it to any position. Use \u00D7 to delete a block."),
        );
    }
    renderPalette();

    refresh();
    openPanel({
        title: node.title,
        large: true,
        content: panelContent,
        onApply: () => {
            if (foot.classList.contains("error")) return false;
            if (isRouter && importIssues.length) {
                selectRouterTab(3);
                return false;
            }
            const lines = [];
            for (const [r, rule] of rules.entries()) {
                if (isRouter && !rule.tokens.length && !rule.flow) continue;
                try {
                    const tokens = lex(toText(rule.tokens));
                    parse(tokens);
                    if (isRouter && !rule.flow) throw new Error("choose a flow");
                    const text = toText(tokens.map(toToken));
                    lines.push(isRouter ? `${text} => ${rule.flow}` : text);
                } catch (err) {
                    active = r;
                    refresh();
                    showError((isRouter ? `Rule ${r + 1}: ` : "") + err.message);
                    if (isRouter) selectRouterTab(2);
                    return false;
                }
            }
            if (elseFlow) lines.push(`else => ${elseFlow}`);
            if (!isRouter) {
                const inputValues = Object.values(nodeIO.inputs).map((name) => name.trim());
                if (inputValues.some((name) => !/^[A-Za-z_]\w*$/.test(name)) || new Set(inputValues).size !== inputValues.length) {
                    showError("Input names must be unique and use letters, numbers, or underscores.");
                    return false;
                }
                nodeIO.inputs = Object.fromEntries(Object.entries(nodeIO.inputs).map(([slot, name]) => [slot, name.trim()]));
                syncExpressionNodeIO(node, nodeIO);
                if (inputNamesWidget) {
                    inputNamesWidget.value = JSON.stringify(nodeIO.inputs);
                    inputNamesWidget.callback?.(inputNamesWidget.value);
                }
                if (outputConfigWidget) {
                    outputConfigWidget.value = JSON.stringify(nodeIO.outputs);
                    outputConfigWidget.callback?.(outputConfigWidget.value);
                }
                if (methodsWidget) {
                    methodsWidget.value = JSON.stringify(methods.map((method, index) => ({
                        id: method.id,
                        name: method.name,
                        expression: toText(rules[index]?.tokens || []),
                    })));
                    methodsWidget.callback?.(methodsWidget.value);
                }
            }
            if (isRouter) {
                if (!ensureInputSlots()) {
                    importIssues = ["Router supports up to 26 imported inputs."];
                    renderImportConfig();
                    selectRouterTab(3);
                    return false;
                }
                const inputNames = Object.fromEntries(Object.entries(routerInputs).map(([slot, name]) => [slot, name.trim() || slot]));
                const usedNames = Object.values(inputNames);
                if (usedNames.some((name) => !/^[A-Za-z_]\w*$/.test(name)) || new Set(usedNames).size !== usedNames.length) {
                    showError("Input names must be unique and use letters, numbers, or underscores.");
                    return false;
                }
                inputWidget.value = JSON.stringify(inputNames);
                inputWidget.callback?.(inputWidget.value);
                applyRouterInputNames(node, inputNames);
                if (importWidget) {
                    importWidget.value = JSON.stringify(importedFlows);
                    importWidget.callback?.(importWidget.value);
                }
                if (customInputsWidget) {
                    customInputsWidget.value = JSON.stringify(customInputs);
                    customInputsWidget.callback?.(customInputsWidget.value);
                }
                syncRouterOutputSlots(node, routerOutputs.length);
            }
            widget.value = isRouter ? lines.join("\n") : toText(rules[0]?.tokens || []);
            widget.callback?.(widget.value);
            if (isRouter) {
                outputWidget.value = JSON.stringify(routerOutputs);
                outputWidget.callback?.(outputWidget.value);
                applyRouterOutputs(node, routerOutputs);
            }
            node.setDirtyCanvas(true, true);
        },
    });
}

app.registerExtension({
    name: "objn.ExpressionBlocks",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (!(nodeData.name in WIDGET)) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            hideWidget(this.widgets.find((w) => w.name === WIDGET[nodeData.name]));
            if (nodeData.name === "ObjnRouter") {
                removeLegacyEditorSockets(this, nodeData.name);
                dedupeRouterInputSlots(this);
                const outputWidget = this.widgets.find((w) => w.name === ROUTER_OUTPUTS);
                const inputWidget = this.widgets.find((w) => w.name === ROUTER_INPUTS);
                const importWidget = this.widgets.find((w) => w.name === ROUTER_IMPORTED);
                const customInputsWidget = this.widgets.find((w) => w.name === ROUTER_CUSTOM_INPUTS);
                hideWidget(outputWidget);
                hideWidget(inputWidget);
                if (importWidget) hideWidget(importWidget);
                if (customInputsWidget) hideWidget(customInputsWidget);
                let imported = [];
                try { imported = JSON.parse(importWidget?.value || "[]"); } catch { /* older Router node */ }
                const savedOutputs = routerOutputsOf(outputWidget.value, 1);
                if (!Array.isArray(imported) || !imported.length) savedOutputs.splice(routerOutputCount(this));
                syncRouterOutputSlots(this, savedOutputs.length);
                applyRouterOutputs(this, savedOutputs);
                applyRouterInputNames(this, routerInputNamesOf(inputWidget.value, this.inputs.filter((i) => i.name.startsWith("values."))));
            } else {
                removeLegacyEditorSockets(this, nodeData.name);
                dedupeRouterInputSlots(this);
                const inputNames = this.widgets.find((w) => w.name === NODE_INPUT_NAMES);
                const outputConfig = this.widgets.find((w) => w.name === NODE_OUTPUT_CONFIG);
                const methods = this.widgets.find((w) => w.name === NODE_METHODS);
                if (inputNames) hideWidget(inputNames);
                if (outputConfig) hideWidget(outputConfig);
                if (methods) hideWidget(methods);
                syncExpressionNodeIO(this, expressionNodeConfigOf(inputNames?.value, outputConfig?.value, this));
                dedupeRouterInputSlots(this);
            }
            this.addTitleButton({
                name: "objn_open_blocks",
                text: "\ue93b",
                xOffset: -10,
                yOffset: 0,
                fontSize: 16,
                onClick: () => openEditor(this, nodeData.name),
                callback: () => openEditor(this, nodeData.name),
            });
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
            if (nodeData.name === "ObjnRouter") {
                removeLegacyEditorSockets(this, nodeData.name);
                dedupeRouterInputSlots(this);
                pruneImportedRouterInputs(this);
                const outputWidget = this.widgets.find((w) => w.name === ROUTER_OUTPUTS);
                const inputWidget = this.widgets.find((w) => w.name === ROUTER_INPUTS);
                const importWidget = this.widgets.find((w) => w.name === ROUTER_IMPORTED);
                const customInputsWidget = this.widgets.find((w) => w.name === ROUTER_CUSTOM_INPUTS);
                if (importWidget) hideWidget(importWidget);
                if (customInputsWidget) hideWidget(customInputsWidget);
                let imported = [];
                try { imported = JSON.parse(importWidget?.value || "[]"); } catch { /* older Router node */ }
                const savedOutputs = routerOutputsOf(outputWidget.value, 1);
                if (!Array.isArray(imported) || !imported.length) savedOutputs.splice(routerOutputCount(this));
                syncRouterOutputSlots(this, savedOutputs.length);
                applyRouterOutputs(this, savedOutputs);
                applyRouterInputNames(this, routerInputNamesOf(inputWidget.value, this.inputs.filter((i) => i.name.startsWith("values."))));
            } else {
                removeLegacyEditorSockets(this, nodeData.name);
                dedupeRouterInputSlots(this);
                const inputNames = this.widgets.find((w) => w.name === NODE_INPUT_NAMES);
                const outputConfig = this.widgets.find((w) => w.name === NODE_OUTPUT_CONFIG);
                const methods = this.widgets.find((w) => w.name === NODE_METHODS);
                if (inputNames) hideWidget(inputNames);
                if (outputConfig) hideWidget(outputConfig);
                if (methods) hideWidget(methods);
                syncExpressionNodeIO(this, expressionNodeConfigOf(inputNames?.value, outputConfig?.value, this));
                dedupeRouterInputSlots(this);
            }
        };

        if (nodeData.name === "ObjnRouter" || nodeData.name === "ObjnCalculator" || nodeData.name === "ObjnCompare") {
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function () {
                const result = onConnectionsChange?.apply(this, arguments);
                requestAnimationFrame(() => {
                    dedupeRouterInputSlots(this);
                    if (nodeData.name === "ObjnRouter") pruneImportedRouterInputs(this);
                });
                return result;
            };
        }

        const onTitleButtonClick = nodeType.prototype.onTitleButtonClick;
        nodeType.prototype.onTitleButtonClick = function (button) {
            if ((typeof button === "string" ? button : button?.name) === "objn_open_blocks") openEditor(this, nodeData.name);
            else onTitleButtonClick?.apply(this, arguments);
        };
    },
});
