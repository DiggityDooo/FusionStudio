# Installed integration evidence

Inspection date: 2026-10-12 (user local date). All installed files were read only. None of these three applications was run. No native REA session was opened because the useful interfaces were established by installed source/configuration and primary vendor docs rather than native decompilation.

## Actionable defaults

Build a separate companion that coordinates **new project exchange folders** and a Blender backend. Use the installed executables only for user-visible handoffs. Keep original application installations, content libraries, and source projects untouched. Do not copy commercial engines into the new program or claim an embedded engine based on available DLLs.

| Application | Exact launch path | Initial transfer |
| --- | --- | --- |
| DAZ Studio | `C:\Program Files\DAZ 3D\DAZStudio4\DAZStudio.exe` | FBX for rigs; OBJ+MTL for static geometry; existing Daz to Blender bridge after compatibility check |
| Marvelous Designer | `C:\Program Files\Marvelous Designer Enterprise Network Offline\MarvelousDesigner_Enterprise_Offline.exe` | OBJ/FBX avatars in, OBJ static garments or Alembic simulation cache out |
| Character Creator 5 | `C:\Program Files\Reallusion\Character Creator 5\Bin64\CharacterCreator.exe` | FBX with JSON, textures and any FBX key preserved together |

Executable identities are observed from local files. MD reports **2026, 0, 315, 56650**; CC reports **5.07.1623.1**. Windows version strings on DAZStudio.exe and DzCore.dll were empty; DAZ version remains unknown.

## Observations

- **DAZ:** `resources\fileiopresets.dsx` lines 1-43 explicitly defines OBJ importer/exporter settings. Its Blender preset is **1 unit = 50 cm**, Scale 50, Z up. Do not silently treat that as meter scale. FBX import/export plugins and `dzblenderbridge.dll` exist. The local Daz to Blender help index points to the bridge documentation. These files establish installed components, not successful loading. Other bridge DLL names, including an MCP bridge, were inventoried only; no endpoint or protocol was inspected.
- **CC5:** the installed `Bin64\OpenPlugin\Blender Pipeline Plugin` includes full Python source. `main.py` registers export/import, DataLink, Go-B and morph actions. `btp\vars.py:19` reports version 2.4.0. `btp\exporter.py:912` and `:975` call `RFileIO.ExportFbxFile`; `btp\importer.py:273` and `:275` call `LoadFbxFile`. The shipped `RLPy.py:13433` wrapper exposes those methods, OBJ export and project loading/saving. This is a strong candidate for deeper integration, but does not establish the runtime can be imported from a separate process.
- **MD:** Python 3.11 files and FBX/Alembic dependencies are installed. The [official format table](https://support.marvelousdesigner.com/hc/en-us/articles/47358199862553-Compatible-File-Format) documents OBJ, FBX and Alembic interchange, with COLLADA import only. The [official Python page](https://developer.marvelousdesigner.com/python.html) describes Script > Python, and the [API reference](https://developer.marvelousdesigner.com/list.html) documents path/options forms for OBJ and Alembic export and OBJ/FBX import. No local SDK example or standalone automation interface was found in the bounded filename searches.
- **CC5 output bundles:** the [FBX export manual](https://manual.reallusion.com/Character-Creator-5/Content/ENU/5.0/17-Export/Export-FBX.htm) documents sibling JSON and texture outputs. The installed exporter source also builds `.fbxkey` paths. Preserve the complete handoff directory; generic FBX import alone may not reconstruct the vendor's specialized shaders.

## Design inferences and unresolved checks

File handoff is a practical common interface. That is a design inference, not an observed end-to-end transfer. Start launch calls with no assumed command-line file/import flags. All app-specific automation and Blender 5.2 addon compatibility remain unverified. MD's documented Python functions can support a later in-app helper, but there is no evidence here for headless execution. CC DataLink exists in source; its listener protocol and execution were not tested.

OBJ units, axes and sidecars need explicit project metadata. The app should show the selected import scale and preserve imported originals within its new project folders. Native DUF, ZPRJ and CC project files are source assets for their own programs, not formats that a generic Blender importer should claim to support.

`integrations.json` records per-claim evidence IDs and limitations. IDs are local finding identifiers, not REA-produced evidence IDs. `original-files-manifest.json` records a bounded pre-run SHA-256, size and UTC mtime snapshot for the relevant executables, plugins, source files and configuration. This does not claim whole-installation coverage.
