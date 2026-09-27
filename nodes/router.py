import json
import os
import string

import folder_paths
import nodes
from aiohttp import web
from comfy_api.latest import io
from comfy_execution.graph_utils import ExecutionBlocker, GraphBuilder, add_graph_prefix
from server import PromptServer

from .calculator import evaluate_expression

WORKFLOWS_DIR = os.path.join(folder_paths.get_user_directory(), "default", "workflows")
LEGACY_FLOWS_DIR = os.path.join(folder_paths.get_user_directory(), "objn_flows")
NUM_OUTPUTS = 4
UNTYPED = {"*", "COMFY_MATCHTYPE_V3"}


def list_flows():
    flows = {}
    if os.path.isdir(WORKFLOWS_DIR):
        for root, dirs, files in os.walk(WORKFLOWS_DIR):
            dirs[:] = [directory for directory in dirs if not directory.startswith(".")]
            for filename in files:
                if filename.lower().endswith(".json"):
                    path = os.path.join(root, filename)
                    name = os.path.relpath(path, WORKFLOWS_DIR)[:-5].replace(os.sep, "/")
                    flows[name] = path
    # Keep flows selected by older Router workflows usable.
    if os.path.isdir(LEGACY_FLOWS_DIR):
        for filename in os.listdir(LEGACY_FLOWS_DIR):
            if filename.lower().endswith(".json"):
                name = os.path.splitext(filename)[0]
                flows.setdefault(name, os.path.join(LEGACY_FLOWS_DIR, filename))
    return flows


def workflow_to_prompt(workflow):
    if not isinstance(workflow, dict) or not isinstance(workflow.get("nodes"), list):
        return workflow

    nodes_by_id = {str(node["id"]): node for node in workflow["nodes"] if "id" in node}
    links = {}
    workflow_links = workflow.get("links", [])
    if isinstance(workflow_links, dict):
        workflow_links = workflow_links.values()
    for link in workflow_links:
        if isinstance(link, dict):
            links[str(link["id"])] = link
        elif len(link) >= 6:
            links[str(link[0])] = {
                "origin_id": link[1], "origin_slot": link[2],
                "target_id": link[3], "target_slot": link[4],
            }

    reroute_types = {"Reroute", "Reroute (rgthree)"}

    def link_source(link_id, visited=None):
        link = links.get(str(link_id))
        if link is None:
            return None
        source_id, source_slot = str(link["origin_id"]), link["origin_slot"]
        source = nodes_by_id.get(source_id)
        if source and source.get("type") in reroute_types:
            visited = visited or set()
            if source_id in visited:
                raise ValueError("Router: saved workflow contains a reroute loop")
            visited.add(source_id)
            inputs = source.get("inputs", [])
            reroute_link = inputs[0].get("link") if inputs else None
            return link_source(reroute_link, visited) if reroute_link is not None else None
        return [source_id, int(source_slot)]

    prompt = {}
    for node_id, node in nodes_by_id.items():
        node_type = node.get("type")
        if node_type in reroute_types or node.get("mode", 0) == 2:
            continue
        if node.get("mode", 0) == 4:
            raise ValueError(f"Router: save workflow '{node_type}' after removing bypass mode")
        inputs = {}
        widget_values = iter(node.get("widgets_values", []))
        for slot in node.get("inputs", []):
            widget = slot.get("widget")
            if widget:
                try:
                    value = next(widget_values)
                except StopIteration:
                    value = None
                if slot.get("link") is None and value is not None:
                    inputs[widget.get("name", slot["name"])] = {"__value__": value} if isinstance(value, list) else value
            if slot.get("link") is not None:
                source = link_source(slot["link"])
                if source is not None and source[0] in nodes_by_id and nodes_by_id[source[0]].get("mode", 0) != 2:
                    inputs[slot["name"]] = source
        prompt[node_id] = {
            "inputs": inputs,
            "class_type": node_type,
            "_meta": {"title": node.get("title") or node_type},
        }
    return prompt


@PromptServer.instance.routes.get("/objn/flows")
async def get_flows(request):
    return web.json_response(sorted(list_flows()))


def workflow_io_interface(workflow):
    """Read Flow Input names and Flow Output names/types from a saved UI workflow."""
    if not isinstance(workflow, dict) or not isinstance(workflow.get("nodes"), list):
        raise ValueError("workflow is not a saved ComfyUI UI graph")

    node_map = {str(node["id"]): node for node in workflow["nodes"] if "id" in node}
    links = workflow.get("links", [])
    link_map = {}
    if isinstance(links, dict):
        links = links.values()
    for link in links:
        if isinstance(link, dict):
            link_map[str(link["id"])] = link
        elif len(link) >= 6:
            link_map[str(link[0])] = {
                "origin_id": link[1], "origin_slot": link[2],
                "target_id": link[3], "target_slot": link[4],
            }

    def widget_values(node):
        result = {}
        values = iter(node.get("widgets_values", []))
        for slot in node.get("inputs", []):
            widget = slot.get("widget")
            if widget:
                try:
                    value = next(values)
                except StopIteration:
                    value = None
                result[widget.get("name", slot.get("name"))] = value
        return result

    def type_name(value):
        if isinstance(value, (list, tuple)):
            value = ",".join(str(item) for item in value)
        value = str(value or "*").strip()
        return value or "*"

    input_types = {}
    outputs = {}
    for node_id, node in node_map.items():
        node_type = node.get("type")
        if node_type == "ObjnFlowInput":
            name = str(widget_values(node).get("name") or "a").strip()
            expected = set()
            for link_id in (node.get("outputs") or [{}])[0].get("links") or []:
                link = link_map.get(str(link_id))
                if not link:
                    continue
                target = node_map.get(str(link.get("target_id")))
                target_slot = int(link.get("target_slot", -1))
                target_inputs = target.get("inputs", []) if target else []
                if 0 <= target_slot < len(target_inputs):
                    expected.add(type_name(target_inputs[target_slot].get("type")))
            concrete = sorted(t for t in expected if t not in {"*", "COMFY_MATCHTYPE_V3"})
            input_types.setdefault(name, set()).update(concrete or ["*"])
        elif node_type == "ObjnFlowOutput":
            values = widget_values(node)
            name = str(values.get("name") or "").strip()
            if name.isdigit():
                name = f"out_{max(1, int(name))}"
            if not name:
                # Older workflows selected outputs by a one-based slot number.
                try:
                    name = f"out_{max(1, int(values.get('slot', 1) or 1))}"
                except (TypeError, ValueError):
                    name = "out_1"
            input_slot = next((item for item in node.get("inputs", []) if item.get("name") == "value"), {})
            link = link_map.get(str(input_slot.get("link"))) if input_slot.get("link") is not None else None
            output_type = "*"
            if link:
                source = node_map.get(str(link.get("origin_id")))
                source_slot = int(link.get("origin_slot", -1))
                source_outputs = source.get("outputs", []) if source else []
                if 0 <= source_slot < len(source_outputs):
                    output_type = type_name(source_outputs[source_slot].get("type"))
            outputs.setdefault(name, set()).add(output_type)

    return {
        "inputs": [{"name": name, "type": ",".join(sorted(types))} for name, types in sorted(input_types.items())],
        "outputs": [
            {"name": name, "type": ",".join(sorted(types))}
            for name, types in outputs.items()
        ],
    }


def imported_input_slots(selected_flows, flow_paths):
    names = []
    for flow in selected_flows:
        path = flow_paths.get(flow)
        if not path:
            continue
        try:
            with open(path, encoding="utf-8") as f:
                interface = workflow_io_interface(json.load(f))
        except (OSError, ValueError, TypeError, KeyError, IndexError):
            continue
        for item in interface["inputs"]:
            if item["name"] not in names:
                names.append(item["name"])
    return {name: string.ascii_lowercase[index] for index, name in enumerate(names[:26])}


@PromptServer.instance.routes.get("/objn/flow-interfaces")
async def get_flow_interfaces(request):
    available = list_flows()
    requested = request.query.getall("flow", [])
    result = {}
    for name in requested:
        path = available.get(name)
        if not path:
            continue
        try:
            with open(path, encoding="utf-8") as f:
                result[name] = workflow_io_interface(json.load(f))
        except (OSError, ValueError, TypeError, KeyError, IndexError) as error:
            result[name] = {"error": str(error), "inputs": [], "outputs": []}
    return web.json_response(result)


def pick_flow(rules, values):
    for number, line in enumerate(rules.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        condition, sep, flow = line.rpartition("=>")
        if not sep:
            raise ValueError(f"Router: line {number} must look like '<condition> => <flow>'")
        condition = condition.strip()
        if condition == "else" or evaluate_expression(condition, values):
            return flow.strip()
    raise ValueError("Router: no rule matched and there is no 'else => <flow>' rule")


class Router(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ObjnRouter",
            display_name="Router",
            category="objn/flow",
            description=f"Runs the first matching saved workflow from {WORKFLOWS_DIR}. Use Flow Input and Flow Output nodes to pass values in and out.",
            inputs=[
                # These are editor-backed configuration widgets, not graph inputs.
                # Without socketless=True ComfyUI exposes sockets for them, which
                # overlap the dynamic `values.*` inputs and make cable drops look
                # like duplicate ports.
                io.String.Input("rules", default="", multiline=True, socketless=True),
                io.String.Input("output_types", default="", tooltip="Router output names and types.", socketless=True),
                io.String.Input("input_names", default="{}", tooltip="Router input names.", socketless=True),
                io.String.Input("imported_flows", default="[]", tooltip="Workflows selected in the Router editor.", socketless=True),
                io.String.Input("custom_inputs", default="[]", tooltip="Additional Router inputs.", socketless=True),
                io.Autogrow.Input("values", optional=True, template=io.Autogrow.TemplateNames(
                    io.AnyType.Input("value"),
                    names=list(string.ascii_lowercase),
                    # Autogrow always creates one trailing empty input. With
                    # min=1 it creates both `a` and `b` up front, so use zero
                    # to start with only `a`.
                    min=0,
                )),
            ],
            outputs=[io.AnyType.Output(f"out_{i}") for i in range(1, NUM_OUTPUTS + 1)],
            hidden=[io.Hidden.dynprompt, io.Hidden.unique_id],
            enable_expand=True,
        )

    @classmethod
    def execute(cls, rules, output_types, input_names="{}", imported_flows="[]", custom_inputs="[]", values=None):
        try:
            input_names = json.loads(input_names)
        except (ValueError, TypeError):
            input_names = {}
        if not isinstance(input_names, dict):
            input_names = {}
        values = values or {}
        named_values = {input_names.get(slot, slot): value for slot, value in values.items()}
        flow = pick_flow(rules, named_values)
        flows = list_flows()
        if flow not in flows:
            raise ValueError(f"Router: workflow '{flow}' not found in {WORKFLOWS_DIR}. Available: {', '.join(sorted(flows)) or 'none'}")
        try:
            selected_flows = json.loads(imported_flows)
        except (ValueError, TypeError):
            selected_flows = []
        if not isinstance(selected_flows, list):
            selected_flows = []
        imported_slots = imported_input_slots(selected_flows, flows) if flow in selected_flows else {}
        with open(flows[flow], encoding="utf-8") as f:
            graph, _ = add_graph_prefix(workflow_to_prompt(json.load(f)), [], GraphBuilder.alloc_prefix())

        missing = sorted({node["class_type"] for node in graph.values()} - nodes.NODE_CLASS_MAPPINGS.keys())
        if missing:
            raise ValueError(f"Router: workflow '{flow}' uses node types that are not installed: {', '.join(missing)}")

        router_inputs = cls.hidden.dynprompt.get_node(cls.hidden.unique_id)["inputs"]
        outputs = [None] * NUM_OUTPUTS
        for node_id, node in list(graph.items()):
            if node["class_type"] == "ObjnFlowInput":
                name = node["inputs"]["name"]
                slot = imported_slots.get(name) or next((slot for slot, input_name in input_names.items() if input_name == name), name)
                if f"values.{slot}" not in router_inputs:
                    raise ValueError(f"Router: workflow '{flow}' needs input '{name}', but it is not connected")
                node["inputs"]["value"] = router_inputs[f"values.{slot}"]
            elif node["class_type"] == "ObjnFlowOutput":
                flow_output_inputs = node["inputs"]
                output_name = str(flow_output_inputs.get("name") or "").strip()
                legacy_slot = None
                if not output_name or output_name.isdigit():
                    # Keep Router workflows saved before named Flow Outputs working.
                    try:
                        legacy_slot = max(1, int(output_name or flow_output_inputs.get("slot", 1) or 1))
                    except (TypeError, ValueError):
                        legacy_slot = 1
                if output_types.strip().startswith("["):
                    try:
                        configs = json.loads(output_types)
                        output_names = [str(item.get("name", f"out_{i + 1}")).strip() or f"out_{i + 1}" for i, item in enumerate(configs)]
                    except (ValueError, TypeError, AttributeError):
                        output_names = [f"out_{i + 1}" for i in range(NUM_OUTPUTS)]
                else:
                    output_names = [f"out_{i + 1}" for i in range(NUM_OUTPUTS)]
                if legacy_slot is not None:
                    output_index = legacy_slot - 1
                elif output_name.startswith("out_") and output_name[4:].isdigit() and output_name not in output_names:
                    # Positional alias for old workflows whose Router output
                    # was renamed while Flow Output still stored only a slot.
                    output_index = max(0, int(output_name[4:]) - 1)
                elif output_name not in output_names:
                    raise ValueError(f"Router: flow '{flow}' returns unknown output '{output_name}'")
                else:
                    output_index = output_names.index(output_name)
                if output_index >= NUM_OUTPUTS:
                    target_name = output_names[output_index] if output_index < len(output_names) else output_name or f"slot {legacy_slot}"
                    raise ValueError(f"Router: Flow Output '{target_name}' exceeds the {NUM_OUTPUTS} supported outputs")
                outputs[output_index] = flow_output_inputs["value"]
                del graph[node_id]

        if output_types.strip().startswith("["):
            try:
                config = json.loads(output_types)
                declared = [str(item.get("type", "*")).strip() or "*" for item in config]
                output_names = [str(item.get("name", f"out_{i + 1}")).strip() or f"out_{i + 1}" for i, item in enumerate(config)]
            except (ValueError, TypeError, AttributeError) as e:
                raise ValueError("Router: output settings are invalid") from e
        else:
            # Keep existing workflows that stored comma-separated output types working.
            declared = [t.strip() or "*" for t in output_types.split(",")] if output_types.strip() else []
            output_names = [f"out_{i + 1}" for i in range(len(declared))]
        if len(declared) > NUM_OUTPUTS:
            raise ValueError(f"Router: output_types lists {len(declared)} types, but there are only {NUM_OUTPUTS} outputs")
        for slot, expected in enumerate(declared, 1):
            if expected == "*":
                continue
            output_name = output_names[slot - 1]
            link = outputs[slot - 1]
            if link is None:
                raise ValueError(f"Router: workflow '{flow}' has no Flow Output for '{output_name}' (declared {expected})")
            source = graph[link[0]]
            produced = nodes.NODE_CLASS_MAPPINGS[source["class_type"]].RETURN_TYPES[link[1]]
            produced_types = {t.strip() for t in produced.split(",") if t.strip() and t.strip() not in UNTYPED}
            expected_types = {t.strip() for t in expected.split(",") if t.strip()}
            if produced_types and not produced_types.issubset(UNTYPED) and expected_types and not produced_types.issubset(expected_types):
                raise ValueError(f"Router: workflow '{flow}' returns {produced} on '{output_name}', but Router declares {expected}")

        result = [
            link if link is not None else ExecutionBlocker(
                f"Router: flow '{flow}' has no Flow Output for '{output_names[slot - 1] if slot - 1 < len(output_names) else f'out_{slot}'}'"
            )
            for slot, link in enumerate(outputs, 1)
        ]
        return io.NodeOutput(*result, expand=graph)

    @classmethod
    def fingerprint_inputs(cls, **kwargs):
        return tuple(sorted((name, os.path.getmtime(path)) for name, path in list_flows().items()))
