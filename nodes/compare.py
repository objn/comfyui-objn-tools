import string
import json

from comfy_api.latest import io

from .calculator import evaluate_expression


class Compare(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ObjnCompare",
            display_name="Compare (Logic)",
            category="objn",
            description="Evaluates a condition using connected inputs a, b, c... Supports == != < <= > >=, and, or, not and arithmetic.",
            inputs=[
                io.String.Input("expression", default="a > b", multiline=True, socketless=True),
                io.String.Input("input_names", default='{"a":"a","b":"b"}', socketless=True),
                io.String.Input("output_config", default='[{"name":"out_1","method":"method_1"}]', socketless=True),
                io.String.Input("methods", default="[]", socketless=True),
                io.Autogrow.Input("values", optional=True, template=io.Autogrow.TemplateNames(
                    io.MultiType.Input("value", [io.Int, io.Float, io.String]),
                    names=list(string.ascii_lowercase),
                    min=1,
                )),
            ],
            outputs=[io.Boolean.Output(f"out_{i}") for i in range(1, 5)],
        )

    @classmethod
    def execute(cls, expression, input_names="{}", output_config="[]", methods="[]", values=None):
        try:
            aliases = json.loads(input_names or "{}")
        except (TypeError, ValueError):
            aliases = {}
        variables = {aliases.get(slot, slot): value for slot, value in (values or {}).items()}
        try:
            method_specs = json.loads(methods or "[]")
        except (TypeError, ValueError):
            method_specs = []
        if not isinstance(method_specs, list) or not method_specs:
            method_specs = [{"id": "method_1", "expression": expression}]
        method_expressions = {item.get("id"): item.get("expression", "") for item in method_specs if isinstance(item, dict)}
        method_expressions.setdefault("method_1", expression)
        try:
            outputs = json.loads(output_config or "[]")
        except (TypeError, ValueError):
            outputs = []
        if not isinstance(outputs, list) or not outputs:
            outputs = [{"name": "out_1"}]
        outputs = outputs[:4]
        expression_results = {}
        results = []
        for output in outputs:
            method_id = output.get("method", "method_1") if isinstance(output, dict) else "method_1"
            method_expression = method_expressions.get(method_id)
            if method_expression is None:
                raise ValueError(f"Compare: output references missing method '{method_id}'")
            if method_id not in expression_results:
                expression_results[method_id] = bool(evaluate_expression(method_expression, variables))
            results.append(expression_results[method_id])
        return io.NodeOutput(*(results + [None] * (4 - len(results))))
