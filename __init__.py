from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .nodes.calculator import Calculator
from .nodes.compare import Compare
from .nodes.display_number import DisplayNumber
from .nodes.flow_io import FlowInput, FlowOutput
from .nodes.router import Router
from .nodes.selection import CheckboxSelection, RadioSelection
from .nodes.tokenizer import Tokenizer

WEB_DIRECTORY = "web"


class ObjnExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [Tokenizer, DisplayNumber, Calculator, Compare, Router, FlowInput, FlowOutput, RadioSelection, CheckboxSelection]


async def comfy_entrypoint() -> ObjnExtension:
    return ObjnExtension()
