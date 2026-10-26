# DAZ and Marvelous Designer behind one workspace

Research date: 2026-10-13 (America/Los_Angeles). Read-only investigation of the supplied installations, narrowly derived application data locations, native character file metadata, and primary vendor documentation. No vendor program was launched by this research pass; no original file, profile, existing bridge channel, or registry setting was changed. The shared REA MCP native session was not opened or replaced.

## Practical result

DAZ has a documented background-worker route: launch the installed executable with an isolated instance name, headless mode, a new workspace script, and script arguments. That script can map the existing libraries, load a native character, change loaded parameters, and export OBJ or FBX for Fusion Studio's Blender worker. This can remove user application switching if the local runtime probe succeeds. The installation alone does not prove that every plugin is headless compatible.

Marvelous Designer has documented in-application Python operations for import/export, patterns, fabric, and simulation. A Python plug-in can live in the workspace and be registered through its plug-in manager. Current inspected documentation establishes neither external script launch nor a headless server. Building a remote worker requires establishing a safe host-event-loop entry point and start mechanism; copying its runtime DLLs does not establish an independent garment engine.

## DAZ evidence ledger

| ID | Evidence | Observation and limits |
|---|---|---|
| DAZ-SP01 | `C:/Program Files/DAZ 3D/DAZStudio4/DAZStudio.exe`, SHA-256 `6ab22d5c4c27834960166ee3b64e85df16609ea3b2ea4bb7fb335d17cef4465b` | ASCII `-headless` at original file offset `0x2030`; `-noPrompt` at `0x2068`. A static candidate for installed support, not execution proof. |
| DAZ-SP02 | [Command Line Options](https://docs.daz3d.com/public/software/dazstudio/4/referenceguide/tech_articles/command_line_options/start), inspected lines 78–148 and 175–206 | Documents named instances, settings/UI copying controls, script arguments, no-prompt and headless modes, and final filename argument. Headless and no-prompt are experimental. No-prompt closes the app when an unsuppressed dialog occurs; third-party compliance is incomplete. |
| DAZ-SP03 | [Application Instancing](https://docs.daz3d.com/public/software/dazstudio/4/referenceguide/tech_articles/command_line_options/application_instancing/start), lines 71–106 | `#` in the name selects a free Windows instance number; named instance settings/UI cleanup and root-copy behavior have explicit controls. This is documented isolation, not verified preservation of every shared plugin/cache location. |
| DAZ-SP04 | `C:/Program Files/DAZ 3D/DAZStudio4/plugins/dsp_dazmcpbridge_d4.dll`, 57,344 bytes, SHA-256 `04efd6146f635e1892f9ffd741ab382c4fa524c926a6049572c6371089abd4a7` | Bounded ASCII strings: `DAZMCP_BRIDGE_ROOT` at `0x7ae8`; `/bridge.dsa` `0x7b00`; `/DAZ 3D/BigBat/sendtodaz` `0x7b20`; `/bridge` `0x7b78`; `/cmd.json` `0x7b80`; injected `DMCP_PLUGIN_BRIDGE_DIR` `0x7b92`; `/heartbeat.json` `0x7d50`; missing-handler/inert text `0x7cb8`, `0x7d20`. Strings establish file-polling candidates, not confirmed native value flow. |
| DAZ-SP05 | `C:/Users/Sean/AppData/Roaming/DAZ 3D/BigBat/sendtodaz/bridge.dsa` | Lines 17–20 document command/result JSON contract; 36–48 define injected channel or default app-data directory; 80–94 write result; 219–235 evaluate code; 237–252 load/execute a `.dsa`; 263–279 open scene; 281–319 merge `.duf`; 360–406 consume command and dispatch. Readable source proves an implementable protocol, not current load/activity. |
| DAZ-SP06 | `HKCU/Software/DAZ/Studio4`, read-only root values | `NumContentDirs=2`; `ContentDir0=C:/Users/Public/Documents/My DAZ 3D Library`; `ContentDir1=C:/Users/Sean/Documents/DAZ 3D/Studio/My Library`; `CloudDir=C:/Users/Sean/Documents/DAZ 3D/Studio/My Daz Connect Library`. Both native roots exist. Do not scan entire drives. |
| DAZ-SP07 | `C:/Users/Sean/AppData/Roaming/DAZ 3D/Studio4/ContentDirectoryManager.dsx` | Sole line is an empty directory-manager element. The inspected actual mappings are in registry values, not this file. |
| DAZ-SP08 | `C:/Program Files/DAZ 3D/DAZStudio4/resources/fileiopresets.dsx`, lines 1–43 | Shipped OBJ preset labeled Blender, 1 unit = 50 cm, has Scale=50, X lateral, Z vertical, Y depth. Its common settings use `InvertLatAxis`, etc.; the scripting sample below uses `InvertLat`, etc. Use sample API keys and validate dimensions. |
| DAZ-SP09 | [DzContentMgr](https://docs.daz3d.com/public/software/dazstudio/4/referenceguide/scripting/api_reference/object_index/contentmgr_dz), lines 120–123 and 1315–1325 | Content and Poser directories can be mapped with `saveSetting=false`. `openFile(path,false)` replaces a native scene; true merges. Return value indicates success. |
| DAZ-SP10 | [DzApp](https://docs.daz3d.com/public/software/dazstudio/4/referenceguide/scripting/api_reference/object_index/app_dz), lines 718–728 and 815–835 | `delayedExit(code)` queues application exit. `getAppDataInstancePath()` identifies current instance data; the ordinary `getAppDataPath()` is release-wide. `quit()` and `exit()` were not established. |

### Candidate process launch, not executed

Use a normal argument array, not a string assembled for a shell:

```text
Executable: C:/Program Files/DAZ 3D/DAZStudio4/DAZStudio.exe
Arguments:
  -instanceName FusionStudioJob#
  -headless
  -noPrompt
  -noDefaultScene
  -cleanOnLaunch true
  -cleanOnExit true
  -copyAppSettings !
  -copySessionUI !
  -scriptArg <new workspace job JSON path>
  <new workspace one-shot .dsa path>
```

The unsupported single-character copy-source `!` is the documented no-match mechanism. Avoid copying a user profile when the script can map native libraries with non-persistent API calls. Cleanup applies to the child instance; never invoke `-resetDefaults` on the normal profile. Set the child working directory and output files to the new project job folder. Existing vendor plugins can still use shared locations, so verify those separately.

The installed Big Bat plug-in auto-start text and file channels mean a named DAZ instance alone is insufficient evidence that existing channels will be untouched. `DAZMCP_BRIDGE_ROOT` is an environment-root candidate; no native decompilation confirmed its exact interpretation in this pass. If probing it, use a new workspace root and compare existing channels before/after. Do not send commands to the existing user's channels during a new worker test.

### Script APIs and outputs

Initialize native mappings with `App.getContentMgr().addContentDirectory(root,false)` and, if needed, `addPoserDirectory(root,false)`. Read job parameters from `App.scriptArgs`. Check `openFile(character,false)` and output existence. Do not save to the source scene. Queue `App.delayedExit(code)` after writing an independent structured result. The shipped `resources/wizard pages/DzHomeWizardFrame/HomePage.dsa:162` uses global `processEvents()`; a one-shot synchronous load/export job need not introduce a permanent polling loop.

[Silent OBJ Export](https://docs.daz3d.com/public/software/dazstudio/4/referenceguide/scripting/api_reference/samples/file_io/export_obj_silent/start) documents `DzObjExporter`, `DzFileIOSettings`, `getOptions(settings,false,"")`, settings, and `writeFile(path,settings)`. Set `RunSilent=1` and provide a fixed output path, removing the example's file dialog. Candidate overrides for a material-carrying Y-up export: Scale=100; LatAxis=X, VertAxis=Y, DepthAxis=Z; InvertLat/InvertVert/InvertDepth=false; IgnoreInvisible=true; WriteVT/WriteVN/WriteO/WriteG/WriteUsemtl/WriteMtllib/CollectMaps=true; GroupNodes=true; GroupGeom/GroupSurfaces/GroupSingle/ConvertMaps=false; SelectedOnly/SelectedRootsOnly/PrimaryRootOnly/IncludeParented/TriangulateNgons/CollapseUVTiles=false; FloatPrecision=8. The meter interpretation is inferred from the installed centimeter preset and requires measured output validation. OBJ carries geometry, UVs and basic material sidecars; it does not preserve a rig.

[Silent FBX Export](https://docs.daz3d.com/public/software/dazstudio/4/referenceguide/scripting/api_reference/samples/file_io/export_fbx_silent/start) documents `DzFbxExporter`, the same settings/write flow, and `RunSilent=1`. Candidate rigged-character overrides: doSelected/doVisible=false; doFigures/doProps=true; doLights/doCameras/doAnims=false; doMorphs optional; format=`FBX 2012 -- Binary`; doCopyTextures=true, doEmbed=false; doDiffuseOpacity/doMergeClothing/doStaticClothing=false; degradedSkinning/degradedScaling=true; doSubD/doCollapseUVTiles=false. `rules` contains newline-separated matching strings and Bake/Export/Ignore actions. Validate current figure skinning and materials through Blender before advertising fidelity. Vendor sample adaptations should retain their stated CC BY 3.0 attribution.

[DzElement](https://docs.daz3d.com/public/software/dazstudio/4/referenceguide/scripting/api_reference/object_index/element_dz) documents `getPropertyList()`, `findProperty(internalName)` and label search. [DzFloatProperty](https://docs.daz3d.com/public/software/dazstudio/4/referenceguide/scripting/api_reference/object_index/floatproperty_dz) documents numeric bounds, `getValue()` and `setValue(value)`, which respects controllers. A practical UI can enumerate actual loaded controls and re-export after changes. Some morphs are supplied by modifiers or depend on installed assets; figure-root enumeration alone must not be presented as complete.

### Native demo characters found

Read-only JSON parsing, with optional gzip recognition, confirmed actual native character metadata and scene-node references:

| Path | SHA-256 | Observed native root |
|---|---|---|
| `C:/Users/Public/Documents/My DAZ 3D Library/People/Genesis 9/Genesis 9.duf` | `e20b4f3cfbdbfe0f9ef4be685ec3d35853aaac2ad7dbb4d6a5b3448e3406b9a2` | `Genesis9`, asset type character; URL `/data/Daz%203D/Genesis%209/Base/Genesis9.dsf#Genesis9` |
| `C:/Users/Public/Documents/My DAZ 3D Library/People/Genesis 8 Female/Genesis 8 Basic Female.duf` | `e21adb473e329c7ce0b869a7c0515774dd9ce15dc1d0e42081d92baa4626d9c6` | `Genesis8Female`, asset type character |
| `C:/Users/Public/Documents/My DAZ 3D Library/People/Genesis 8 Male/Genesis 8 Basic Male.duf` | `782afbe4e90058a7f4c768cd4cb006ca07e4f2e401d2e7fa57d429bf32cbbfc8` | `Genesis8Male`, asset type character |

These are existing sources, not copied or exported outputs. Runtime dependencies and complete texture/morph availability are unverified. For a test, select one base figure and write every derived asset into Fusion Studio's project job directory.

## Marvelous Designer evidence and options

The installed `python311.dll`, `python3.dll`, `python311.zip` and format DLLs corroborate an embedded environment. Inventory of the supplied install found no standalone API wrapper or example `.py` file; the installed Python zip had 3,526 members, and a name-bounded API-module search found only ordinary Python packages/tests. This negative result is limited to visible files and member names; APIs can be embedded in the host executable.

[Python Script](https://support.marvelousdesigner.com/hc/en-us/articles/47358277921177-Python-Script) and [Python API](https://developer.marvelousdesigner.com/python.html) document Script > Python in the application. The developer page still has a CLO wording inconsistency. [Plug-in Management](https://developer.marvelousdesigner.com/register.html) documents loading a `.py` from an external path through the plug-in manager. Registration is a user-settings change; it does not require modifying Program Files but was not performed.

[API Scenario](https://developer.marvelousdesigner.com/scenario.html) shows embedded modules `import_api`, `export_api`, `pattern_api`, `fabric_api`, `utility_api`, `ApiTypes`, creating a new project, importing avatar/garment, `utility_api.Simulate(100)`, and `pattern_api.CreatePatternWithPoints(points)`. The [API List](https://developer.marvelousdesigner.com/list.html) documents silent option-bearing OBJ/FBX import, ZPRJ loading and garment exports. Its REST_API section (4652–4674) describes outgoing HTTP requests and callbacks, not a server to control MD externally. A known doc inconsistency: Simulate/CreatePatternWithPoints are in the scenario page but not found in the inspected API-list text.

An [official support response from June 2022](https://support.marvelousdesigner.com/hc/en-us/community/posts/48272742764441-Python-Command-Line-Example?page=1) says its old MVPython was internal and no headless session was available then. This is historical evidence, not proof of the 2026 installed build's current limits. No newer supported headless/script-launch entry was established by this bounded search.

Relevant content/config locations observed:

- `C:/Users/Public/Documents/MarvelousDesigner/New Assets`: actual avatar and project content. Base candidates include `Avatar/Female/FV2.1_Mia.avt`, `Avatar/Male/MV2.1_Luka.avt`, and male/female mannequin assets.
- `C:/Users/Public/Documents/MarvelousDesigner/Plugins/pluginSettings.json`: lines 1–5 contain an empty plugins array and version 2.
- `C:/Users/Public/Documents/MarvelousDesigner/Configuration/python311`: ordinary Python libraries/DLLs, not evidence of a separately importable MD engine.
- `C:/Program Files/Marvelous Designer Enterprise Network Offline/Preset/Project/MD/Untitled_MD.zprj` and `Default_MD.zprj`; `Preset/Skinsuit/SkinSuit.zpac`; Genesis 8/9 avatar conversions under `Preset/Avatar/Converting/Female` and `Male`. Presence only, not tested usable demos.

Practical options: use Blender's already accessible cloth engine for fully native Fusion Studio garment editing/simulation now; add an MD worker only after its host bootstrap and event-loop dispatch are proved. A workspace Python plug-in could poll an isolated local queue and dispatch on the MD main thread, but safe polling/thread scheduling is unresolved. Hiding or reparenting a vendor window is not established embedding of its engine and would not alone satisfy a new native workflow.

## Research status and next checks

| Question | Status |
|---|---|
| Can DAZ run without a user switching to its UI? | Officially supported headless candidate and installed option strings; actual worker/export unverified. |
| Can its installed bridge receive external commands? | Exact local handler source found; native bridge initialization/load state unverified. |
| Can source characters and morph controls be reused? | Native files, content mappings and API calls established; runtime output/fidelity unverified. |
| Can MD create/simulate from scripts? | Primary in-app examples establish candidate APIs; installed build compatibility unverified. |
| Can MD run externally/headless? | Unresolved; no supported entry established. |
| Can vendor DLLs be merged into an independent executable? | No usable independent host/engine ABI established. |

An independent `npx rea-agents@6.4.0 trace ... DAZMCP_BRIDGE_ROOT --provider ghidra` failed with `provider_unavailable`: CLI Ghidra directory unset, Java unavailable, IDA unconfigured. Full diagnostic is saved in `research/daz-bridge-env-rea-trace.json`. It produced no native execution evidence and did not access the shared active MCP target. Continue at the exact environment-root branch when a configured provider is available; do not rerun unchanged provider attempts.

## Follow-up: CMS startup and minimum native worker dependencies

The main task reported that its first copied-runtime headless probe started the existing CMS cluster even with a named instance and settings copying disabled. This is reported runtime evidence from the main task; this research pass did not launch DAZ. Named instance isolation must not be described as CMS/database isolation.

Read-only observations:

- `C:/Users/Sean/AppData/Roaming/DAZ 3D/cms/cmscfg.json:2` sets DatabaseClusterPath to `C:/Users/Sean/AppData/Roaming/DAZ 3D/cms`; line 3 sets Port=17237.
- `C:/Users/Sean/AppData/Roaming/DAZ 3D/cms/ContentCluster/postgresql.conf:64` also sets port=17237. These are original shared paths, not project-owned data.
- PE import-table parsing confirms `DzCore.dll` statically imports `dzcmsconnector.dll` and `LIBPQ.dll`. The connector is a load-time dependency, not an optional plugin that can safely be omitted from the runtime copy.
- Native connector string candidates at original file offsets: `NeverStartCMS` `0x15a680`, `PgBin` `0x15a690`, `DatabaseClusterPath` `0x15a698`, `Port` `0x15a6b0`, `StopDBOnClose` `0x15a6d8`, `ClusterName` `0x15a700`. A ctor export accepts `IDzCMSAppHelper*`, a `QMap<QString,QVariant>` and a bool; this suggests internal configurable options but does not establish a public startup flag or how options are populated.
- Bounded string inventory of the executable/core command-line names found no CMS suppression flag. Names including `-safe` and `-moduleLocation` exist but are not established CMS controls. Searches of current official CLI documentation and the exact `NeverStartCMS` term established no supported suppression mechanism.

[4.9.3.166 Change Log](https://docs.daz3d.com/public/software/dazstudio/4/change_log_4_9_3_166) documents startup reconciliation of the PostgreSQL port with cmscfg.json, updating the JSON when values differ. It also documents that changing CMS options writes cmscfg.json and the cluster's postgresql.conf. Consequently `App.getAssetMgr().setCMSOptions(...)` is not a safe way to redirect an already started worker while preserving original files. [DzAssetMgr](https://docs.daz3d.com/public/software/dazstudio/4/referenceguide/scripting/api_reference/object_index/assetmgr_dz) documents start/stop and CMS option APIs; a script runs after startup and cannot retroactively prevent startup writes. Do not call stopCMS on a potentially shared original service.

Plugin candidates for an eventual isolated worker, not a verified minimal set:

- `plugins/dzfbxexporter.dll` registers DzFbxExporter; its PE imports include DzCore.dll, QtCore4, QtScript4, QtGui4, root `libfbxsdk.dll` and the C++ runtime.
- `plugins/dzobjexporter.dll` registers DzObjExporter; imports include DzCore.dll, QtCore4, QtScript4, QtGui4 and the C runtime.
- `plugins/dzassetiofilters.dll` contains a self-description at file offset `0xc0b80` stating that it saves DSON assets. This does not prove it is needed to load a `.duf`. Core contains DSON character/material option classes; import ownership needs runtime verification.
- Genesis 9's native material entries use extra type `studio/material/uber_iray`. Retain `dzirayrenderer.dll` and associated resources for an initial material-fidelity probe; their exact minimum dependency set remains unknown.

Concrete next steps: do not launch another native worker against the shared configuration while claiming full original-data preservation. Trace the internal NeverStartCMS option through the connector's constructor and the core's caller, or establish actual OS profile/filesystem isolation including the CMS and its network connection. Changing child APPDATA/USERPROFILE strings alone is not evidence that Windows known-folder APIs or vendor paths will follow them. A read-only or disconnected CMS layer also needs established handling of startup connection failure under `-noPrompt`.

### Direct DSON source reading removes the CMS dependency

There is an independent source-data route which does not require launching DAZ: [DSON File Format Specification](https://docs.daz3d.com/public/dson_spec/start). Read-only parsing of `C:/Users/Public/Documents/My DAZ 3D Library/data/Daz 3D/Genesis 9/Base/Genesis9.dsf` confirmed geometry_library, node_library, and modifier_library in ordinary JSON. The base geometry has 25,182 vertices, 25,156 polygons, seven material group names, a default UV URI, 139 node definitions, and SkinBinding entries with joint weights. Each inspected polygon starts with face-group and material-group indexes, followed by vertex indexes, matching the [polygon spec](https://docs.daz3d.com/public/dson_spec/object_definitions/polygon/start).

Implement source reference resolution with the [asset addressing rules](https://docs.daz3d.com/public/dson_spec/format_description/asset_addressing/start): a leading slash is relative to a mapped content root; URI escapes and fragment IDs matter. The [geometry](https://docs.daz3d.com/public/dson_spec/object_definitions/geometry/start), [UV set](https://docs.daz3d.com/public/dson_spec/object_definitions/uv_set/start), [morph](https://docs.daz3d.com/public/dson_spec/object_definitions/morph/start), [skin binding](https://docs.daz3d.com/public/dson_spec/object_definitions/skin_binding/start), and [weighted joint](https://docs.daz3d.com/public/dson_spec/object_definitions/weighted_joint/start) definitions support geometry, UVs, sparse morph deltas and general skin weights in a project-owned Blender worker.

This supports a real independent importer while keeping all source library files read-only. Start with one measured base figure and validate vertices, polygons, orientation, material assignment, and a sparse base-resolution morph. Resolve source dependencies within explicit mapped roots and never rewrite source URI files. Full DAZ parity remains separate work: formula-driven morphs, HD subdivision deltas, bone orientations, dual-quaternion/TriAx behavior, grafts, conforming clothing, shader semantics and proprietary extras require dedicated handling. No direct importer was implemented or executed in this research pass.
