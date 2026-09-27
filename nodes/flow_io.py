from comfy_api.latest import io


class FlowInput(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ObjnFlowInput",
            display_name="Flow Input",
            category="objn/flow",
            description="Receives the Router input with the same name. 'value' is only used when this flow runs on its own.",
            inputs=[
                io.String.Input("name", default="a"),
                io.AnyType.Input("value", optional=True),
            ],
            outputs=[io.AnyType.Output()],
        )

    @classmethod
    def execute(cls, name, value=None):
        return io.NodeOutput(value)


class FlowOutput(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ObjnFlowOutput",
            display_name="Flow Output",
            category="objn/flow",
            description="Sends 'value' to the Router output with the same name.",
            inputs=[
                io.String.Input("name", default="out_1", socketless=True),
                io.AnyType.Input("value"),
            ],
            outputs=[],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, name, value):
        return io.NodeOutput()
