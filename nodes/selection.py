from comfy_api.latest import io

DEFAULT_OPTIONS = "Option A => a\nOption B => b\nOption C => c"


def parse_options(text):
    options = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        label, sep, value = line.partition("=>")
        options[label.strip()] = value.strip() if sep else label.strip()
    return options


class RadioSelection(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ObjnRadioSelection",
            display_name="Radio Selection",
            category="objn",
            description="Pick one option; outputs the value mapped to it. Options are 'label => value' lines.",
            inputs=[
                io.String.Input("options", default=DEFAULT_OPTIONS, multiline=True),
                io.String.Input("selected", default="Option A"),
            ],
            outputs=[io.String.Output()],
        )

    @classmethod
    def execute(cls, options, selected):
        parsed = parse_options(options)
        if selected not in parsed:
            raise ValueError(f"Radio Selection: '{selected}' is not one of the options: {', '.join(parsed)}")
        return io.NodeOutput(parsed[selected])


class CheckboxSelection(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="ObjnCheckboxSelection",
            display_name="Checkbox Selection",
            category="objn",
            description="Pick any number of options; outputs their values joined by the separator, in option order. Options are 'label => value' lines.",
            inputs=[
                io.String.Input("options", default=DEFAULT_OPTIONS, multiline=True),
                io.String.Input("selected", default=""),
                io.String.Input("separator", default=", ", tooltip="Text placed between values. Use \\n for a new line."),
            ],
            outputs=[io.String.Output()],
        )

    @classmethod
    def execute(cls, options, selected, separator):
        chosen = set(selected.splitlines())
        values = [value for label, value in parse_options(options).items() if label in chosen]
        return io.NodeOutput(separator.replace("\\n", "\n").join(values))
