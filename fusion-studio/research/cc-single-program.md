# Character Creator 5: single-program integration evidence

Inspection date (client context): 2026-10-12. Scope: read-only installed Python sources, a bounded inventory of the configured Reallusion content folders, exact non-secret registry path values, and primary product documentation. No vendor application, native binding, character, garment, or project was executed/opened. Original files and settings were not changed. No native REA session was opened; native DLL exports and initialization behavior remain unexamined.

## Result

The installed Blender Pipeline plugin contains a concrete TCP automation boundary. An Electron client can **in principle** implement that protocol while presenting one interface. The code still runs Character Creator operations inside the Character Creator application. This is not evidence of a Character Creator engine that can be loaded into Electron, or of a supported headless Character Creator process. Runtime success has not been tested.

The strongest path to a program with no routine switching is to own the modeling interface and geometry operations, and optionally attach a host adapter for native CC assets and shaping. The adapter must be labeled unavailable until a CC host and a compatible plugin are actually connected. A stock DataLink connection alone does not cover all of CC's character-creation tools and still opens UI for morph-slider creation.

## Installed-source evidence

All plugin paths below are relative to `C:/Program Files/Reallusion/Character Creator 5/Bin64/OpenPlugin/Blender Pipeline Plugin/`. The wrapper path is `C:/Program Files/Reallusion/Character Creator 5/Bin64/RLPy.py`.

| ID | Observation | Source |
|---|---|---|
| CC-S01 | `RLPy.py` is SWIG-generated and imports the native `_RLPy` module. It does not contain the engine implementation. | `RLPy.py:1-15` |
| CC-S02 | Plugin imports RLPy, immediately queries host product/version, registers CC5 identity, and adds CC menu/toolbar commands. | `main.py:17-73`, `main.py:76-129` |
| CC-S03 | DataLink uses PySide2, RLPy scene objects, Qt signals, and a QTimer; creating the DataLink object creates an RLPy dock widget. | `btp/link.py:17-24`, `btp/link.py:977-1007`, `btp/link.py:1074-1080`, `btp/link.py:1588-1614`; `btp/qt.py:59-65` |
| CC-S04 | Source default is `AUTO_START_SERVICE=False`. Host initialization starts the service only when this option is true. The current local plugin configuration also sets it false. | `btp/options.py:20-26`, `btp/options.py:98-111`; `main.py:128-129`; configured `ccic_blender_pipeline_plugin.txt` described below |
| CC-S05 | Menu action can start DataLink without reopening its dock window; source `link_auto_start()` constructs DataLink and starts its service. This suppresses neither CC's main application nor every operation dialog. | `main.py:185-192`; `btp/link.py:4292-4297` |
| CC-S06 | RApplication wrapper exposes product/version/program/content paths, but this inspected class supplies no standalone engine initialization or headless start API. This is a bounded observation, not proof that no private native entrypoint exists. | `RLPy.py:15074-15155` |

## DataLink endpoint and messages

Observed static protocol, not runtime verification:

* TCP IPv4 server port **9333**. `SERVER_ONLY=True`; server binds `('', 9333)` rather than loopback only. An integration should connect locally and avoid implementing a new network-facing listener. (`btp/link.py:30-41`, `1034-1045`, `1323-1331`)
* Frame header: **8 bytes**, two network-order unsigned 32-bit integers, opcode followed by payload length (`struct.pack/unpack('!II', ...)`). JSON control messages are UTF-8. (`btp/link.py:465-474`, `1179-1189`, `1416-1426`)
* Server sends HELLO on accept. Server HELLO includes `Application`, `Version`, `Path`, `Plugin`, `Exe`. Client HELLO expects `Application`, `Version`, `Path`, with optional `Addon`, `FPS`, `Local`. (`btp/link.py:1120-1134`, `1243-1270`, `1280-1298`)
* Only one current client is retained: an incoming connection disconnects an existing connected client. A Fusion adapter must not silently displace a user's Blender connection. (`btp/link.py:1258-1267`)
* For ordinary local import/update operations, messages refer to disk paths. FILE opcode 75 is a separate tar transfer path: UTF-8 remote ID payload followed by another uint32 tar byte count and file bytes. (`btp/link.py:1203-1219`, `1311-1319`)
* Stock receiver reads a header with a single `recv(8)` and only handles an 8-byte result; it is not a robust generic streaming decoder. A client should use a complete header/payload write and controlled payload sizes, then test fragmentation and cancellation rather than treating this as a hardened service. (`btp/link.py:1179-1202`)

| Incoming operation | Opcode / scope | Source |
|---|---|---|
| Character import | 100; JSON requires `path`, `name`, `type`, `link_id`, optional `remote_id`. Loads an existing FBX with the pipeline importer, `no_window=True`. | `btp/link.py:61`, `2247-2248`, `4168-4191`; `btp/importer.py:242-275` |
| Create morph slider | 90; JSON includes OBJ path, key path, actor identity, morph name/path. Receiver constructs MorphSlider; its constructor creates and shows a window with a Create Slider button. This stock operation is **interactive**. | `btp/link.py:57`, `4213-4235`; `btp/morph.py:65-75`, `129-137` |
| Mesh replacement | 95; OBJ file path plus actor/object/mesh identity. Finds a source mesh and invokes safe replacement. Error paths open CC message boxes. | `btp/link.py:59`, `4237-4268` |
| Material update | 96; JSON sidecar path plus actor identity. Uses pipeline importer in `no_window=True, json_only=True` mode and refreshes host viewport. | `btp/link.py:60`, `4271-4282` |
| Pose / sequence | 210/211, 220/221/222/223; control JSON plus binary frame payload, actor templates, bone IDs and timing. Operates on existing RLPy scene actors. | `btp/link.py:70-76`, `2223-2242`, `3740` onward, `3933` onward |
| Camera / frame / FPS sync | 231/232/80. Host scene synchronization. | `btp/link.py:56`, `78-79`, `2259-2263`, `3410-3479` |
| Request / confirm | 250/251; actor identity handshake. Stock `receive_request` confirms actors and returns bones/IDs. `receive_confirm` handles POSE, SEQUENCE, SCENE, MOTIONS, ACTORS; ACTORS then exports found actors. It is not a general command execution API. | `btp/link.py:3844-3857`, `3883-3929`, `3499-3561` |

`btp/link.py:2208-2274` is the inspected dispatch boundary. No general native-asset load, shaping-weight, arbitrary Python execution, host-start, or render RPC was observed there. Do not infer a generic RPC from REQUEST or DEBUG names. Sender opcodes also include PROP, STAGING, CAMERA, MOTION, LIGHTING, RIGIFY and updates, but opcode existence alone does not establish symmetric incoming support.

Character export produces FBX files in the configured exchange folder, runs the pipeline exporter with `no_window=True`, then sends a CHARACTER message carrying path, actor identity, FPS and frame range (`btp/link.py:2500-2547`). The plugin README says return FBX must preserve matching object/material names and updated JSON texture metadata; hidden clothing-face information is lost on reimport (`README.md:8-12`, `63-69`). These constraints affect fidelity in a unified application.

## RLPy operations an additional host adapter could expose

Observed wrapper surfaces, all runtime-unverified:

* `RFileIO.LoadFile`, `LoadObject`, `LoadProject`, `SaveProject`, `ExportFbxFile`, `ExportObjFile`, and `SaveThumbnailToFile`: `RLPy.py:13433-13499`.
* `RIAvatarShapingComponent.GetShapingMorphIDs`, display names, categories, min/max, weights, and `SetShapingMorphWeight`: `RLPy.py:6344-6374`.
* `RIAvatarShapingComponent.CreateSlider`: `RLPy.py:6352-6353`; installed morph code calls the host component to create a slider (`btp/morph.py:261-285`).

An original workspace-owned CC adapter could queue a bounded set of these actions on the CC host's UI/event thread and send exported results to Fusion. The installed plugin's source and the [CC5 Script menu manual](https://manual.reallusion.com/Character-Creator-5/Content/ENU/5.0/03-Main-Menu/Menu-Script.htm) support loading a workspace script through Script > Load Python. This does not require copying a plugin into the installation. It does require the running host and an initial script-load step; automatic loading from an untouched installation and an external launch flag are unestablished. The installed README describes this in-app alternative (`README.md:31-32`), and `main.py:255-256` defines `run_script()`.

The presence of `Bin64/_RLPy.pyd`, `CharacterCreatorpy.exe`, and Python DLLs is inventory evidence only. Their filenames do not prove that Electron or a separate Python can construct a CC scene. The [vendor's Python API explanation](https://wiki.reallusion.com/IC_Python_API%3ACapabilities_And_Limitations) describes scripts executing in iClone and a subset of its C++ SDK. This older iClone document is context, not a complete CC5 capabilities contract. The [current Blender Pipeline manual](https://manual.reallusion.com/CC_and_IC_Auto_Setup_Plugin/ENU/CC_and_iC_Auto_Setup/2.0/06-for-Blender/Blender-Landing.htm) describes bidirectional object and motion transfer; it does not document a standalone CC engine.

## Configured local asset roots

Observed by exact registry values plus directory/file inventory. No asset contents were opened. The user authorized reuse of paid assets and created characters; original asset paths should be read-only library sources and outputs should go to a new project/cache folder.

| Purpose | Observed path / configuration |
|---|---|
| Shared template asset library | `C:/Users/Public/Documents/Reallusion/Reallusion Templates` — `HKLM/SOFTWARE/Reallusion/Character Creator/5.0`, value `Template Data` |
| CC5 custom library | `C:/Users/Public/Documents/Reallusion/Custom/Character Creator 5 Custom` — same registry key, value `Custom Data` |
| Template characters | `C:/Users/Public/Documents/Reallusion/Reallusion Templates/Actor/Character` |
| Template projects | `C:/Users/Public/Documents/Reallusion/Reallusion Templates/Project/CC Project` |
| DataLink exchange | `<user-profile>/Documents/Reallusion/DataLink` — current plugin config `datalink_folder` |
| Plugin config file | `C:/Users/Public/Documents/Reallusion/Custom/Character Creator 5 Custom/ccic_blender_pipeline_plugin.txt` — current `auto_start_service=false`; `blender_path=C:/Program Files/Blender Foundation/Blender 5.2/blender-launcher.exe` |
| Local application cache/settings | `<user-profile>/AppData/Local/Reallusion/Character Creator/5.0` — directory observed; nested `5.0`, `cache`, `QtWebEngine` |
| Temp/cache | HKCU key of same CC5 version: `Temp Folder=<user-profile>/AppData/Local/Temp/`, `Cache Path` and `Motion Cache Path=<user-profile>/AppData/Local/Temp/RLCache/` |
| Installed default project | `C:/Program Files/Reallusion/Character Creator 5/Program/Default/DefProject.iProject` — HKLM value `Default Project` |

The configured template root contains Actor, ActorMIXER, Animation, Avatar Preset, Cloth, Hair, Makeup, Media, Others, Project, Props, Set, Skin, Stage and Accessory folders. The bounded Actor inventory contains **54 `.ccAvatar`/`.iAvatar` files**. The Project/CC Project inventory contains **11 `.ccProject` files**. The template root includes **2,278 `.ccSlider`**, **137 `.ccCloth`**, **188 `.ccMixerPreset`**, **169 `.ccSkinGenPreset`**, plus native materials, cameras, poses, motion and skin assets. Native file presence does not prove export authorization or format compatibility. No .fbx/.obj/.blend exports were found in the inspected DataLink folder; it was empty. The configured CC5 custom root currently contained one plugin config `.txt` file and an empty Media subfolder; no user-created native characters/projects were observed within that bounded root. Other user-selected project directories were not searched.

Actionable library behavior: index these configured roots by filename, extension, category and sibling thumbnail. Permit immediate import of ordinary mesh formats where the existing Blender importer supports them. For `.ccAvatar`, `.iAvatar`, `.ccProject`, `.ccCloth`, `.ccSlider` and other native CC formats, expose their true native type and route conversion/application through a connected host adapter. Do not send them to the generic Blender importer or label them as imported merely because catalog indexing succeeds. Do not overwrite original content when loading, shaping or converting.

## Remaining requirements and unknowns

1. Prove that CC5 5.07.1623.1 can load a workspace-owned adapter and that its requested RLPy functions work on a disposable project. A wrapper method is not execution evidence.
2. Establish host lifecycle: launching CC without stealing focus, script/plugin startup, license/modal dialogs, shutdown and cancellation. No headless flag or reliable hidden host startup was established.
3. Verify local DataLink framing, HELLO compatibility, actor enumeration, export/return material fidelity and Blender 5.2 compatibility. A direct Electron client is an inference from socket source; it was not connected.
4. Add an explicit native-file load and morph-weight API to a workspace-owned adapter if reuse of CC presets/shaping is required. Stock DataLink dispatch does not expose those operations.
5. Resolve morph-slider UI: stock receiver is interactive. A host adapter could call shaping methods directly, but must be separately tested.
6. Standalone DLL reuse remains unresolved: this pass did not inspect exported native ABI/constructors, dependency initialization or licensing interfaces. No embeddable engine claim is justified.

## Source fingerprints

SHA-256 from read-only hashing of original files:

* `RLPy.py`: `644F83A03E6C1DE0E76A08FE6F97DE7BF8A583B448FD9FE8CAED10F69DE34A86`
* `btp/link.py`: `8F97F7D5A1978C36624B2397552888F1B4E667DF81252DF5AF9482263A321E63`
* `main.py`: `59553B25163EA5017456A70C272AC25871A7C9D088333940FDF0EF9AEC4691B1`

The inspected Blender Pipeline source is GPL-3.0-or-later (each module header, installed LICENSE). This report specifies observed behavior; no vendor native binaries or plugin source were copied into the application.
