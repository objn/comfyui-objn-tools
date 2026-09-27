from comfy_api.latest import io


class DisplayNumber(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ObjnDisplayNumber",
            display_name="Display Number",
            category="objn",
            inputs=[io.MultiType.Input(io.Float.Input("number", force_input=True), [io.Int, io.Float])],
            outputs=[],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, number):
        return io.NodeOutput(ui={"display_number": [number]})
