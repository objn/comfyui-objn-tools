import ast
import json
import operator
import re
import string

from comfy_api.latest import io

BINARY_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg, ast.Not: operator.not_}
COMPARE_OPS = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
}


def evaluate_expression(expression, variables):
    expression = re.sub(r"\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*'|\^", lambda m: "**" if m.group() == "^" else m.group(), expression)
    return evaluate(ast.parse(expression.strip(), mode="eval"), variables)


def evaluate(node, variables):
    if isinstance(node, ast.Expression):
        return evaluate(node.body, variables)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float, str)):
        return node.value
    if isinstance(node, ast.Name):
        if node.id not in variables:
            raise ValueError(f"Calculator: input '{node.id}' is not connected")
        return variables[node.id]
    if isinstance(node, ast.BinOp) and type(node.op) in BINARY_OPS:
        return BINARY_OPS[type(node.op)](evaluate(node.left, variables), evaluate(node.right, variables))
    if isinstance(node, ast.UnaryOp) and type(node.op) in UNARY_OPS:
        return UNARY_OPS[type(node.op)](evaluate(node.operand, variables))
    if isinstance(node, ast.Compare) and all(type(op) in COMPARE_OPS for op in node.ops):
        left = evaluate(node.left, variables)
        for op, comparator in zip(node.ops, node.comparators):
            right = evaluate(comparator, variables)
            if not COMPARE_OPS[type(op)](left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.BoolOp):
        results = (evaluate(value, variables) for value in node.values)
        return all(results) if isinstance(node.op, ast.And) else any(results)
    raise ValueError(f"Calculator: unsupported expression '{ast.unparse(node)}'")


class Calculator(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ObjnCalculator",
            display_name="Calculator (PEMDAS)",
            category="objn",
            description="Evaluates an expression using connected inputs a, b, c... Supports + - * / // % ^ and parentheses.",
            inputs=[
                io.String.Input("expression", default="a + b", multiline=True, socketless=True),
                io.String.Input("input_names", default='{"a":"a","b":"b"}', socketless=True),
                io.String.Input("output_config", default='[{"name":"out_1","method":"method_1"}]', socketless=True),
                io.String.Input("methods", default="[]", socketless=True),
                io.Autogrow.Input("values", optional=True, template=io.Autogrow.TemplateNames(
                    io.MultiType.Input("number", [io.Int, io.Float]),
                    names=list(string.ascii_lowercase),
                    min=1,
                )),
            ],
            outputs=[io.Float.Output(f"out_{i}") for i in range(1, 5)],
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
                raise ValueError(f"Calculator: output references missing method '{method_id}'")
            if method_id not in expression_results:
                expression_results[method_id] = float(evaluate_expression(method_expression, variables))
            results.append(expression_results[method_id])
        return io.NodeOutput(*(results + [None] * (4 - len(results))))
