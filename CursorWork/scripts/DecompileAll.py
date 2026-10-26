# Headless script to dump defined strings and decompiled C functions to a text file
# @category Analysis
# @runtime PyGhidra
import os
from ghidra.app.decompiler import DecompInterface
from ghidra.util.task import ConsoleTaskMonitor

program = getCurrentProgram()
binary_name = program.getName()
output_filename = binary_name + "_decompiled.txt"
output_path = os.path.join(os.getcwd(), output_filename)

monitor = ConsoleTaskMonitor()
decomp_interface = DecompInterface()
decomp_interface.openProgram(program)

with open(output_path, "w") as out:
    out.write("=== TARGET: {} ===\n\n".format(binary_name))

    # 1. Extract Defined Strings
    out.write("--- DEFINED STRINGS ---\n")
    listing = program.getListing()
    data_iterator = listing.getDefinedData(True)
    for data in data_iterator:
        data_type = data.getDataType().getName().lower()
        if "string" in data_type or "unicode" in data_type:
            value = data.getValue()
            addr = data.getAddress()
            out.write("[{}] {}\n".format(addr, value))
    out.write("\n")

    # 2. Decompile All Functions
    out.write("--- DECOMPILED FUNCTIONS ---\n")
    func_manager = program.getFunctionManager()
    functions = func_manager.getFunctions(True)

    for func in functions:
        name = func.getName()
        entry = func.getEntryPoint()
        out.write("\n/* Function: {} @ {} */\n".format(name, entry))

        results = decomp_interface.decompileFunction(func, 60, monitor)
        if results.decompileCompleted():
            decomp_code = results.getDecompiledFunction().getC()
            out.write(decomp_code + "\n")
        else:
            out.write("// Decompilation timed out or failed\n")

print("[+] Successfully exported decompiled analysis to: {}".format(output_path))
