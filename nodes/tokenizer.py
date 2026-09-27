from comfy_api.latest import io


class Tokenizer(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ObjnTokenizer",
            display_name="Tokenizer",
            category="objn",
            description="Counts the text tokens of a string, excluding start, end and padding tokens.",
            inputs=[
                io.Clip.Input("clip"),
                io.String.Input("text", force_input=True),
            ],
            outputs=[io.Float.Output("float")],
        )

    @classmethod
    def execute(cls, clip, text):
        tokens = next(iter(clip.tokenize(text, return_word_ids=True).values()))
        return io.NodeOutput(sum(1 for batch in tokens for token in batch if token[2] > 0))
