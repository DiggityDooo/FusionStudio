# @category Analysis
# @runtime PyGhidra
"""V2 focused exporter. Existing DecompileAll.py and legacy dumps remain untouched."""
import json
import sys
from pathlib import Path
from ghidra.app.decompiler import DecompInterface
from ghidra.framework import Application
from ghidra.util.task import ConsoleTaskMonitor

arguments = getScriptArgs()
if len(arguments) != 1:
    raise ValueError("Supply an absolute JSON request path")
request_path = Path(str(arguments[0]))
request = json.loads(request_path.read_text(encoding="utf-8-sig"))
sys.path.insert(0, request["scriptsPath"])
from export_protocol import digest, atomic_json, export_selected

program = getCurrentProgram()
binary = request["binary"]
if digest(binary["path"]) != binary["sha256"]:
    raise ValueError("Input binary changed after request preparation")
if str(program.getExecutableSHA256()).lower() != binary["sha256"].lower():
    raise ValueError("Ghidra imported a different binary")
config = request["config"]
manager = program.getFunctionManager()
names = [value.lower() for value in config.get("names", [])]
strings = [value.lower() for value in config.get("strings", [])]
addresses = set(value.lower().removeprefix("0x") for value in config.get("addresses", []))
if not names and not strings and not addresses and not config.get("allFunctions"):
    raise ValueError("Focused export requires names, string references or function addresses")
selected = {}
evidence = []
for function in manager.getFunctions(True):
    address = str(function.getEntryPoint())
    name = str(function.getName())
    if config.get("allFunctions") or address.lower() in addresses or any(term in name.lower() for term in names):
        selected[address] = (address, name, function)
if strings:
    references = program.getReferenceManager()
    for data in program.getListing().getDefinedData(True):
        if not any(kind in str(data.getDataType().getName()).lower() for kind in ("string", "unicode")):
            continue
        value = str(data.getValue())
        if any(term in value.lower() for term in strings):
            hits = []
            for reference in references.getReferencesTo(data.getAddress()):
                function = manager.getFunctionContaining(reference.getFromAddress())
                if function:
                    address = str(function.getEntryPoint())
                    selected[address] = (address, str(function.getName()), function)
                    hits.append(dict(function=address, reference=str(reference.getFromAddress())))
            evidence.append(dict(address=str(data.getAddress()), value=value, references=hits))
functions = sorted(selected.values(), key=lambda item: item[0])
limit = config["maxFunctions"]
matched = len(functions)
functions = functions[:limit]
folder = Path(request["output"])
folder.mkdir(parents=True, exist_ok=True)
atomic_json(folder / "selection.json", dict(matchedFunctions=matched, exportedFunctions=len(functions),
    truncated=matched > limit, strings=evidence, binarySha256=binary["sha256"]))
decompiler = DecompInterface()
if not decompiler.openProgram(program):
    raise RuntimeError("Decompiler could not open the imported program")
task_monitor = ConsoleTaskMonitor()
def decompile(function):
    result = decompiler.decompileFunction(function, config["timeoutSeconds"], task_monitor)
    if not result.decompileCompleted():
        raise RuntimeError(str(result.getErrorMessage()))
    return str(result.getDecompiledFunction().getC())
try:
    manifest = export_selected(folder, binary, config, functions, decompile,
        dict(ghidraVersion=str(Application.getApplicationVersion()), programName=str(program.getName()),
             matchedFunctions=matched, selectionTruncated=matched > limit,
             analysisKind="static pseudocode; no vendor process executed"))
finally:
    decompiler.dispose()
print("Fusion export: {} ({}/{} successful functions); {}".format(
    manifest["status"], manifest["successfulFunctions"], manifest["selectedFunctions"], folder))
