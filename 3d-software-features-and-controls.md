# Industry-Standard 3D Modeling & Rendering: Features, UI Layouts and Controls

A reference of the tools and features found across Blender, Maya, 3ds Max, Cinema 4D, Houdini, ZBrush, Substance 3D, Marvelous Designer, Unreal Engine, Unity and similar software.

> **Note on keybinds:** All shortcuts below are **default** bindings and vary by version, keymap preset and OS (Cmd replaces Ctrl on macOS). Treat them as a starting reference and verify against the app's keymap editor.

---

## Table of Contents

**Part A: Features**
1. Viewport and Scene Management
2. Polygon and Mesh Modeling
3. Curves, NURBS and CAD/Parametric Modeling
4. Procedural and Node-Based Modeling
5. Digital Sculpting
6. Retopology
7. UV Mapping and Unwrapping
8. Texturing and Painting
9. Materials and Shading
10. Lighting
11. Cameras
12. Rendering
13. Rigging
14. Skinning and Deformation
15. Animation
16. Character Creation and Humanoid Tools
17. Hair, Fur and Grooming
18. Cloth and Garment Simulation
19. Physics, Simulation and FX
20. Environment, Scene Assembly and World Building
21. Compositing, Post-Processing and Color
22. Motion Capture, Virtual Production and Real-Time Tools
23. Real-Time and Game Engine Features
24. 3D Printing and Fabrication
25. Scanning, Photogrammetry and Capture
26. Import/Export, File Formats and Pipeline
27. Scripting, Automation and Extensibility
28. UI/UX and Workflow
29. Architecture, Product and Visualization Specifics
30. Motion Graphics and 2D/3D Hybrid Tools
31. AI-Assisted and Emerging Features
32. Collaboration, Asset Management and Production

**Part B: UI Layouts, Keybinds and Controls**
- B1. Universal Conventions
- B2. Common Layout Archetypes
- B3. Per-Application Layouts
- B4. Navigation Schemes
- B5. Transform, Selection and Mode Keys Compared
- B6. Modeling Shortcuts
- B7. Sculpting Controls
- B8. Animation and Playback Keys
- B9. Rendering Shortcuts
- B10. Radial, Pie, Marking and Quad Menus
- B11. Node Editor Conventions
- B12. Tablet and Pen Controls
- B13. Coordinate Systems and Axis Colors
- B14. Keymap Presets Worth Supporting

---

# PART A: FEATURES

## 1. Viewport and Scene Management
- Orbit, pan and zoom navigation; fly/walk mode; focus on selection
- Perspective and orthographic views; multi-view layouts (quad view)
- Shading modes: wireframe, solid, textured, X-ray, matcap, material preview, rendered
- Real-time viewport PBR, ambient occlusion, SSR, shadows and HDRI lighting
- Grid, snapping (vertex/edge/face/grid/surface/increment), and custom pivots
- Transform gizmos (move/rotate/scale), local/global/normal/gimbal orientation
- Outliner or scene hierarchy; parenting, grouping and instancing
- Layers, collections, display layers, visibility and selection isolation
- Selection tools: box, lasso, paint, loop, ring, grow/shrink, select similar, soft select
- Undo history and non-destructive edit stacks
- Reference image planes, background images and blueprints
- Measurement tools, rulers and annotations
- Scene units and scale management
- Multi-object editing
- Viewport clipping and cutaway
- Bookmarks and saved views
- Turntable preview

## 2. Polygon and Mesh Modeling
- Primitive creation: cube, sphere, cylinder, cone, torus, plane, capsule
- Vertex, edge and face editing modes
- Extrude (face/edge/vertex/along path), inset, bevel and chamfer
- Loop cut, edge slide, offset edge loops and multi-cut/knife
- Bridge edge loops, fill hole, and merge/weld/collapse
- Dissolve, delete and clean up edges and vertices
- Bisect/slice, cut with plane, and boolean (union/difference/intersect)
- Mirror and symmetry (object, topology, radial)
- Array, radial array and path array
- Spin, lathe and revolve
- Loft and sweep
- Solidify and shell/thicken
- Triangulate, quadrangulate and tris-to-quads
- Flip and recalculate normals; custom/split normals; smooth/hard edge tagging
- Edge crease and bevel weight
- Subdivision surface (Catmull-Clark, OpenSubdiv) with multi-level preview
- Smooth, relax, flatten and straighten
- Vertex/edge/face merging by distance
- Inflate, shrink/fatten and push/pull
- Lattice, cage and bend/twist/taper/skew deformers
- Proportional/soft editing
- Edge flow tools and topology cleanup
- Mesh decimation and optimization
- Remesh (voxel, quad, Dynamesh-style)
- Convert between mesh, curve, NURBS and subdivision representations
- Mesh analysis: non-manifold detection, ngon detection, poles and flipped normals
- Knife project and shrinkwrap
- Snapping a mesh onto a surface (conform)

## 3. Curves, NURBS and CAD/Parametric Modeling
- Bezier, B-spline and NURBS curves
- Curve editing: CV and control-point manipulation, knot insertion, degree changes
- NURBS surfaces: loft, revolve, extrude, birail, boundary, patch
- Trim, untrim, project curve on surface and surface fillets
- Curve offset, blend, fillet and join
- Surface continuity analysis (G0/G1/G2/G3), zebra stripes and curvature combs
- Sketch-based modeling with constraints
- Feature tree and parametric history
- Assembly constraints and mates
- Sheet metal, weldments and surface-body workflows
- Boolean solids (BREP)
- Exact measurement and tolerances
- STEP, IGES and Parasolid import/export
- Dimensions, GD&T and technical drawing generation
- Exploded views
- Configurations and variants (design tables)
- Topology optimization and generative design
- Finite element analysis (FEA) basics
- Conversion from CAD to mesh

## 4. Procedural and Node-Based Modeling
- Geometry nodes and procedural networks
- Modifier stack (non-destructive)
- Attribute systems and custom data layers
- Point, vertex, primitive and detail attributes
- Scatter/point distribution and instance on points
- Procedural noise, fractal and Voronoi patterns
- Curve-to-mesh and mesh-to-curve
- Procedural building, city and road generation
- Procedural rule-based generation (L-systems, shape grammars)
- Volumes, VDB and SDF modeling
- Field-based operations
- HDAs/node groups/digital assets and exposed parameters
- Randomization and seed control
- Simulation zones and loops/iterations
- Wrangles/expressions/scripting inside nodes
- Procedural UV and procedural material integration
- Cache nodes and time-dependent procedurals

## 5. Digital Sculpting
- Brush set: clay, clay buildup, move, grab, smooth, pinch, crease, inflate, flatten, polish, layer, snake hook, nudge, draw, mask, dam standard, trim, hPolish, slash
- Brush falloff, alpha/stencil textures, stroke types, lazy mouse and spacing
- Dynamic topology and adaptive tessellation
- Multi-resolution sculpting; subdivision levels with detail preservation
- Voxel remesh and dynamesh-style remeshing
- ZRemesher/quad remesh with guides and density painting
- Masking (by brush, cavity, curvature, topology, face sets, polygroups)
- Polygroups/face sets and partitioning
- Hide/isolate/show regions
- Symmetry (axial, radial, topological)
- Sculpt layers with strength sliders
- Morph targets and morph-target storing/switching
- Insert multi-mesh (IMM) and kitbash brushes
- Surface noise and procedural detail
- Stamp and alpha-based detailing
- Subtools/mesh management
- Boolean live and polygroup-based booleans
- Curve-based brushes and tube/stroke tools
- Fibermesh and strand-based sculpting
- Posing tools: transpose, gizmo, mask-based posing, puppet/pose-based deformation
- Project detail (projection/reprojection) and bake between levels
- Sculpt-ready decimation
- Millions-of-polygons performance and GPU sculpting
- Tablet pressure and tilt support
- Stencil and tiling alpha creation
- Retopology-friendly sculpt workflows

## 6. Retopology
- Manual retopology with surface snapping
- Quad draw, poly draw and strip tools
- Auto-retopology (ZRemesher, Quad Remesher, Instant Meshes)
- Edge flow guides and curve guides
- Symmetry-aware retopo
- Density painting
- Re-projection onto high-poly
- Loop-flow tools for faces, joints and hands
- Retopo for animation (deformation-friendly topology)
- Retopo for games (low-poly budgets)
- LOD generation and quad decimation
- Edge constraint preservation during remeshing

## 7. UV Mapping and Unwrapping
- Automatic unwrap, smart UV project, cube/cylinder/sphere/planar projection
- Seam marking and cutting; seam stitching
- Conformal (LSCM/ABF), angle-based and minimum-stretch unwrapping
- UV relax, straighten, pin, align, orient and rotate
- UV packing: manual, automatic, island rotation, padding control
- Texel density checks and normalization
- UDIM tile workflow
- UV distortion/stretch visualization and checker patterns
- UV sets/channels; multi-UV per mesh
- UV copy/transfer between meshes
- Lightmap UV generation
- Atlasing and trim sheets
- UV editing in 3D view (live unwrap)
- Procedural UV tools for triplanar, box and world-space mapping

## 8. Texturing and Painting
- 3D painting with brushes directly on a model
- Layer-based texturing (paint, fill, filter, mask layers)
- Smart materials and smart masks (curvature, AO, thickness, position, world-space normal)
- Procedural texture generators (noise, grunge, patterns, tiles, bricks)
- Substance-style node-graph texture authoring
- Anchor points and non-destructive workflows
- Projection painting, stencils and clone tool
- Triplanar projection
- Decal painting and decal projection
- Mask painting and mask-based generators
- Baking maps: normal, tangent-space, object-space, AO, curvature, thickness, position, world-space normal, ID/color-ID, height/displacement, bent normals, UV-space
- Cage-based bake and ray distance control
- High-to-low poly bake
- Texture channel painting: base color, roughness, metallic, height, emissive, opacity, subsurface, anisotropy, clearcoat, sheen
- Seamless/tiling texture creation
- Texture stitching, sharpening and de-lighting
- Photo-to-material (scan-based material generation)
- Texture atlas creation and compression
- Virtual texturing and mipmap generation
- Texture resolution control and UDIM painting
- Image editing in 3D context (layer styles, blend modes)
- Vertex color painting
- Weight painting (see Rigging)
- Material ID painting
- Material library management
- Export presets for engines (Unreal, Unity, glTF, etc.)

## 9. Materials and Shading
- PBR shaders (metallic-roughness and specular-glossiness workflows)
- Physically based BSDF/uber shader
- Diffuse, specular, reflection, refraction, transmission, IOR
- Subsurface scattering (skin, wax, marble, leaves)
- Translucency and thin-film iridescence
- Clearcoat, sheen, anisotropy and rough conductor/dielectric models
- Emission and light-emitting materials
- Volume shaders (smoke, fog, fire, atmosphere)
- Displacement (bump, normal, true micro-displacement, vector displacement)
- Opacity/alpha, cutouts and dithering
- Node-based shader editors with procedural textures
- Layered and blended materials
- Toon/NPR/cel shading, outline shaders and stylized shading
- Hair/fur shaders (Marschner, Chiang)
- Skin shaders, eye shaders (cornea, sclera, iris), teeth and tear-line shaders
- Car paint, glass, liquid, metal and fabric shaders (with sheen and weave)
- Procedural weathering and aging
- Material instancing and parameter overrides
- OSL/MaterialX/MDL shader support
- Shader baking to textures
- Light-path/ray-visibility controls
- Per-object material overrides
- Vertex-color-driven shader inputs
- Ambient occlusion, curvature and edge-wear shader inputs
- UV-independent world-space and object-space texturing
- Decals and projected materials

## 10. Lighting
- Point, spot, directional/sun, area (rect, disk, sphere, tube), mesh/emissive lights
- IES profile lights
- HDRI and image-based lighting
- Physical sun/sky systems with time-of-day/location
- Light linking and exclusion
- Light intensity in physical units (lumens, nits, EV)
- Color temperature (Kelvin)
- Soft shadows, shadow catchers and contact shadows
- Gobos/cookies and barn doors
- Volumetric lights and god rays
- Light groups and light mixer
- Portal lights for interiors
- Lightmaps and lightmass baking
- Global illumination: path tracing, irradiance cache, light cache, photon mapping, ray-traced GI, Lumen-style dynamic GI
- Caustics
- Mesh light and emissive geometry sampling
- Light-path controls
- Lighting rigs and presets (three-point, studio, HDRI studio)
- Light painting and interactive placement

## 11. Cameras
- Perspective and orthographic cameras
- Focal length, sensor size, FOV and aspect ratio
- Depth of field with aperture/f-stop and focus distance (plus bokeh shape)
- Motion blur (camera and object, shutter angle)
- Lens distortion, chromatic aberration, vignette and lens flare
- Camera shake and procedural camera animation
- Camera rigs: dolly, crane, orbit, follow path
- Tilt-shift
- Stereoscopic/VR/360 panoramic and fisheye
- Safe frames and composition guides
- Camera tracking/matchmoving integration
- Multiple cameras and camera switching
- Exposure, ISO, white balance and tone mapping
- Camera culling and clipping planes
- Cinematic camera presets
- Virtual camera / Live-link support

## 12. Rendering
- Unbiased path tracing, biased/hybrid rendering and real-time ray tracing
- CPU, GPU and hybrid rendering (CUDA, OptiX, Metal, HIP, Vulkan)
- Rasterization and real-time rendering (EEVEE/Unreal-style)
- Progressive/interactive rendering (IPR/live render)
- Denoising (OptiX, OIDN, AI-based) and adaptive sampling
- Render passes/AOVs: beauty, diffuse, glossy, AO, depth, normal, position, cryptomatte, motion vector, shadow, emission, light groups, material ID, object ID, UV, wireframe
- Cryptomatte for compositing
- Multi-layer EXR output with 16/32-bit float and ACES/OCIO color management
- Render regions and render tiles/buckets
- Render farm and distributed network rendering (Deadline, Backburner, cloud)
- Render queue and batch rendering
- Render presets and quality profiles
- Image-based environment rendering
- Out-of-core rendering for large scenes
- Instancing and proxy rendering for heavy scenes
- Toon and NPR render modes
- Hair/fur and volumetric rendering
- Subsurface and SSS rendering modes
- Render time estimators and sampling controls
- Light cache and irradiance map caching
- Shadow catcher and holdout/matte objects for compositing
- Turntable and animation rendering
- Stereo/VR/360° rendering
- Network license and license management
- Render-engine plugins (Cycles, Arnold, V-Ray, Redshift, Octane, RenderMan, Corona, Karma, Eevee, Lumen, Twinmotion, D5)
- Interactive viewport denoising
- Sequence output (PNG, EXR, TIFF, JPEG, video)
- Video encoding (H.264, ProRes, etc.)

## 13. Rigging
- Skeleton/armature/joint creation and orientation
- Forward kinematics (FK) and inverse kinematics (IK)
- IK solvers: single-chain, spline, rotate-plane, spring, multi-chain, HIK
- FK/IK switching and blending
- Constraints: parent, point, orient, aim/track-to, scale, pole vector, copy transforms, limit, child-of, follow path, spring
- Control curves/controllers and custom control shapes
- Set Driven Key/drivers and driver expressions
- Custom attributes and rig UI panels
- Reverse foot and foot roll setups
- Twist joints and corrective joints
- Spine, neck, tail and tentacle spline rigs
- Face rigging: blendshapes/shape keys, bone-based, joint-based, FACS-based
- Facial controls and eye/jaw/tongue rigs
- Auto-rigging (Mixamo-style, Rigify, Advanced Skeleton, HumanIK, Character Creator)
- Biped/quadruped/creature templates
- Modular rig building and rig scripting
- Rig mirroring and symmetry
- Rig layers and visibility sets
- Rig retargeting (see Animation)
- Squash/stretch and stretchy limbs
- Ribbon/spline IK for spine and cloth
- Muscle and flesh simulation
- Jiggle/secondary motion bones
- Dynamic bones and soft-body bones
- Pose libraries and pose mirroring
- Rig bake/export for game engines (FBX, glTF, USD)
- Rig proxies and low-res rig versions
- Control-rig graph (node-based rigs)
- Space switching
- Facial rig transfer between characters
- Corrective blendshapes and pose-space deformation (PSD)

## 14. Skinning and Deformation
- Smooth bind and rigid bind
- Linear blend skinning, dual quaternion skinning
- Weight painting with brush modes (add, replace, smooth, scale)
- Weight mirroring, copying and transferring between meshes
- Auto-weights (heat map, envelope, geodesic voxel)
- Weight normalization, pruning, limits per vertex
- Weight hammer/smoothing tools
- Component editor for weights
- Skin cluster and skin layers
- Delta Mush and smoothing deformers
- Wrap/surface-follow deformers
- Cage deformers and lattice deformers
- Shrinkwrap and sculpt deformers
- Muscle/tissue/flesh deformation
- Cloth-based deformation for tight clothing
- Pose-space and corrective shapes
- Blendshape/morph target tools: creation, combination, in-between, inversion, splitting
- Wrinkle maps and tension-driven maps
- Skin-slide/sliding skin simulation
- Fit and weight transfer for clothing to a character
- Proxy-based weight transfer for clothes
- Bone-based and shape-key-based deformation mixing

## 15. Animation
- Keyframe animation with timeline, dope sheet and graph editor
- Interpolation: linear, constant, Bezier, spline, stepped, custom
- F-curves, tangents, handle editing and curve filters
- Non-linear animation (NLA) / animation layers / clips / tracks
- Motion paths and ghosting/onion skinning
- Pose-to-pose and straight-ahead workflows
- Auto-key and key filtering
- Time-stretching, retiming, speed ramping
- Animation baking and keyframe reduction/simplification
- Looping and cycles (walk/run cycle, ping-pong)
- Pose libraries and animation libraries
- Blend shapes/shape keys animation
- Path animation and follow path
- Camera and object animation
- Procedural animation and expression-driven animation
- Retargeting between different skeletons
- Motion capture import/cleanup and mocap editing (BVH, FBX, C3D)
- Motion matching and motion layering
- State machines and animation blending (game engines)
- Lip sync (phoneme/viseme-based) and audio-driven animation
- Facial animation capture (ARKit, Faceware, Live Link Face, audio2face)
- Crowd simulation and agents
- Muscle-driven animation
- Physics-based animation (ragdoll, active ragdoll)
- Constraint-based animation and baking constraints
- Animation retiming across shots
- Sequencer/shot/cinematic editor
- Previs and storyboard tools
- Grease pencil/2D-in-3D animation
- Motion graphics: cloners, effectors, fields, MoGraph
- Morph-target-based animation
- Mesh cache and Alembic/USD point-cache playback
- Time-warping and animation curves for non-transform values
- Animation compression for game export
- Animation events/notifies

## 16. Character Creation and Humanoid Tools
- Parametric character creators (body, face, age, ethnicity, proportion sliders)
- Morph-based customization
- Base-mesh libraries
- Clothing, shoe and accessory fitting and auto-resizing
- Skin tone, makeup, tattoos, scars, pores, wrinkles, freckles layering
- Facial expression presets and facial pose libraries
- Teeth, tongue, eyes and eyelash libraries
- Hair/beard/eyebrow libraries and groom assets
- Body-shape morphs and fat/muscle sliders
- Bone-scale and proportion adjustments with retargeting
- Character export to Unreal, Unity, Maya, Blender
- Digital-human scan workflows (photogrammetry to rigged face)
- Scan-based facial topology projection and wrap tools
- Character LOD generation
- Digital double and look-dev workflows
- Texture-set generation for characters (multi-UDIM)
- Facial expression libraries and corrective shapes
- Face tracking and performance capture retargeting
- Character import/export between platforms (e.g., Genesis → Maya/Blender)
- Figure/morph asset systems and ERC-style morph linking
- Wardrobe and body-conforming asset systems

## 17. Hair, Fur and Grooming
- Strand-based hair/fur systems and hair cards
- Guide-curve grooming
- Comb, cut, grow, puff, smooth, clump and length brushes
- Hair interpolation (children/clumps)
- Frizz, flyaways, noise, curl, wave and braid generation
- Hair collision and hair dynamics/simulation
- Wind and gravity on hair/fur
- Hair shading (melanin-based, color ramp, root/tip color)
- Fur on animals, creatures and fabric surfaces
- Eyebrow, eyelash and beard tools
- Hair-card conversion for real-time use
- Hair LOD and strand count optimization
- Hair caching, Alembic and groom export
- Hair texture and mask painting
- Hair-to-mesh conversion
- Groom-asset libraries
- Procedural grooming nodes
- Grass/feather/moss-like strand generation

## 18. Cloth and Garment Simulation
- 2D pattern-based garment design
- Pattern drawing, editing, seam creation, and sewing/stitching
- Pattern grading and sizing
- Fabric presets (cotton, silk, leather, denim, wool, etc.) and custom physical properties
- Cloth simulation (stretch, shear, bend, density, friction, damping)
- Collision against animated characters; self-collision and layered garments
- Pins, pressure, tension and wind
- Cloth tearing and cutting
- Pleats, folds, gathers, elastic, stitches and topstitching
- Buttons, zippers, trims and hardware
- Fabric texture and normal-map creation and print/pattern placement
- Garment fitting and auto-resizing to avatars
- Animated-garment simulation (cloth cache)
- Simulation-to-retopo for games
- Cloth-sim caching and export (Alembic, FBX, USD)
- Cloth painting and weight maps for stiffness
- Soft-body and cloth-like deformation in DCCs
- Flags, curtains, capes and sail simulation
- Digital pattern-making for production

## 19. Physics, Simulation and FX
- Rigid-body dynamics and constraints
- Soft-body dynamics
- Cloth (see above)
- Fluid/liquid simulation (FLIP, SPH, PBD)
- Smoke, fire and explosion simulation (grid-based/Pyro)
- Gas/volume solvers
- Particle systems: emitters, forces, collisions, lifespan, instancing
- Destruction/fracture (Voronoi, boolean, procedural)
- Granular/sand/snow/mud simulation
- Vellum-style position-based dynamics
- Hair/fur simulation
- Ocean and wave simulation
- Foam, spray and bubbles
- Vehicle and wheel physics
- Rope, chain and cable simulation
- Ragdoll physics
- Wind, turbulence, vortex and force fields
- Caches: Alembic, VDB, bgeo, USD, point cache
- Simulation substeps and solver quality control
- Collision proxies and collision shapes
- Magnetic, gravitational and custom field forces
- Lightning, electricity and magic/energy FX
- Procedural shatter and debris
- Volumetric rendering for FX
- FX presets and libraries
- Particle rendering as sprites/meshes/volumes
- Real-time VFX (Niagara/VFX Graph/Shuriken-like)
- Simulation visualization and debug tools

## 20. Environment, Scene Assembly and World Building
- Terrain: heightfield generation, erosion, noise, sculpting
- Terrain painting (layers, splat maps) and landscape tools
- Foliage and vegetation scattering
- Procedural tree/plant generators (leaf, branch, growth)
- Wind animation for vegetation
- Rock/cliff generation, scatter and kitbashing
- Road/spline/river/water-body tools
- Water, ocean and lake shaders
- Sky, clouds, atmosphere and weather systems
- Time-of-day systems
- City/building/architectural generation
- Modular kits and snapping asset workflows
- Prefabs/blueprints/asset packs
- Level-of-detail systems and HLOD
- Instancing and proxies for large scenes
- Scene streaming/world partition
- Asset browser and libraries (Quixel, Poly Haven-style)
- Photogrammetry asset integration
- Biome and ecosystem scattering rules
- Decal and detail-mesh scatter
- Interior design and furniture placement tools
- Floor plan to 3D conversion
- Mesh kitbashing libraries
- Level blockout/greybox tools
- Scene optimization and occlusion culling
- Seasonal and procedural variation

## 21. Compositing, Post-Processing and Color
- Node-based compositor
- Multi-pass/AOV compositing and relighting
- Color grading: lift/gamma/gain, curves, LUTs, tone mapping
- Color management (OCIO, ACES, sRGB, Rec.709, Rec.2020, linear workflows)
- Glare, bloom, lens effects and film grain
- Depth-of-field and motion-blur post effects
- Z-depth fog and atmospheric perspective
- Cryptomatte-based masking
- Keying, rotoscoping and matte tools
- Camera tracking and 3D integration (matchmove)
- Denoising passes
- Vignette, chromatic aberration and sharpen
- LUT import/export
- Render-to-compositor live linking
- Image sequence processing
- Real-time post-process volumes (game-engine style)
- Stabilization and distortion correction
- Output to video/sequence formats

## 22. Motion Capture, Virtual Production and Real-Time Tools
- Live link to game engines
- Optical, inertial and webcam-based mocap support
- Facial performance capture
- Virtual camera and virtual scouting
- Real-time retargeting
- LED volume/in-camera VFX workflows (nDisplay-style)
- Timecode and genlock synchronization
- Real-time previs and sequencer
- Live compositing and keying
- VR/AR modeling, sculpting and scene review
- Object and body tracking
- Stage/blocking previz tools

## 23. Real-Time and Game Engine Features
- PBR real-time pipeline
- Virtualized geometry (Nanite-style) and mesh streaming
- Dynamic GI (Lumen-style), baked GI and reflection probes
- Real-time ray tracing and path-traced mode
- LOD generation and impostors
- Collision mesh generation
- Occlusion culling and frustum culling
- Material and shader graph
- Visual scripting (Blueprints/Bolt-style)
- Animation blueprints, state machines, blend spaces, IK rig nodes
- Physics assets and ragdoll setup
- Particle/VFX systems
- Level sequencer/timeline
- Landscape, foliage and world-building systems
- Lightmap baking
- Texture streaming and compression (BCn/ASTC)
- Skeletal mesh and morph target import
- Cloth and hair real-time simulation
- Mesh LODs and nanite-ready mesh pipelines
- Audio integration
- UI/UX systems
- Build/packaging for multiple platforms
- Profiling and performance tools
- Datasmith/live-sync import for CAD and DCC data
- Mobile/XR optimization

## 24. 3D Printing and Fabrication
- Watertight/manifold mesh checks and auto-repair
- Wall-thickness and overhang analysis
- Hollowing and drain-hole creation
- Support generation and editing (auto, tree, manual)
- Slicing: layer height, infill patterns, perimeters, adaptive layers
- Print orientation optimization
- Boolean-based part splitting with alignment keys/pins
- Tolerance and clearance tools
- Model scaling to real-world units
- Multi-material and multi-color print setup
- Lattice/infill generation
- G-code generation/preview and printer profiles
- Resin and FDM-specific workflows
- STL, 3MF and OBJ export
- CNC toolpath generation (CAM)
- Laser-cutting/vector export
- Print time/material estimation
- Textured surface and displacement for print
- Slicer integration with printer firmware/network

## 25. Scanning, Photogrammetry and Capture
- Photogrammetry reconstruction from photos
- LiDAR/depth scan import
- Point-cloud import, editing, cleaning and meshing
- NeRF/Gaussian splat import and viewing
- Mesh cleanup, hole filling and decimation for scans
- De-lighting and texture cleanup
- Scan-to-retopo workflows
- Marker/target alignment
- Body, face and object scanning pipelines
- Texture projection and baking onto retopologized mesh
- Alignment/registration of scans

## 26. Import/Export, File Formats and Pipeline
- Native formats and scene packaging
- FBX, OBJ, glTF/GLB, Alembic (ABC), USD/USDZ, STL, PLY, DAE (Collada), 3DS, BVH, VDB, MaterialX
- STEP, IGES, SAT, JT and Parasolid (CAD)
- 3MF and AMF
- Image formats: PNG, JPG, TIFF, EXR, HDR, TGA, PSD
- Video formats: MP4, MOV/ProRes, AVI
- Batch import/export
- Linking and referencing external files; asset instancing
- Version control integration (Perforce, Git/LFS, ShotGrid, Kitsu)
- Pipeline tools and production tracking (shots, assets, tasks)
- Auto-backup and recovery
- Live link/bridge plugins (Maya–Unreal, Blender–Unity, Daz-to-Maya, etc.)
- Scene optimization and cleanup tools
- Naming conventions and validation tools
- Scene units and axis conversion (Y-up/Z-up)
- Metadata/custom properties
- Sub-asset packaging and texture path relinking
- Cloud storage and project collaboration

## 27. Scripting, Automation and Extensibility
- Python, MEL, MaxScript, C++ SDK, C#, JavaScript, Lua and expression languages
- Node-based visual programming
- Plugin/add-on ecosystems and marketplaces
- Custom tool/UI creation
- Macro/action recording
- Batch processing and command-line/headless operation
- API access to scene data, tools, renderers and exporters
- Event handlers and callbacks
- Custom shelf buttons, hotkeys, marking menus and workspaces
- Render automation and farm submission scripts
- Procedural asset generators
- Machine-learning integration hooks
- Cross-DCC tooling (USD-based pipelines)
- Web/Electron-based and browser-based 3D tool frameworks

## 28. UI/UX and Workflow
- Customizable workspaces/layouts and dockable panels
- Hotkey customization and keymaps (including mimicking other DCCs)
- Marking/radial/pie menus
- Context-sensitive menus and search-based command lookup
- Properties/attribute/inspector panels
- Node editors (shader, geometry, compositing, rig, animation)
- Timeline, dope sheet and graph editor
- Asset browsers with thumbnails and tagging
- Tablet/pen/touch support
- Dark/light themes and scaling
- Multi-monitor support
- Tooltips, built-in tutorials and in-app help
- Auto-save and incremental save
- Project/workspace management
- Real-time collaboration and cloud sync
- Accessibility features

## 29. Architecture, Product and Visualization Specifics
- BIM/Revit/CAD import (Datasmith, Rhino.Inside, IFC)
- Sun-study and daylight analysis
- Section planes, cutaways and elevation views
- Material libraries for architectural finishes
- Furniture/object libraries
- Real-time walkthroughs and VR tours
- Panorama (360) renders and interactive web viewers
- Product configurators and variant rendering
- Studio lighting presets and turntable setups
- Camera matching to photographs
- Photo-real compositing of 3D into photos
- Exploded views and technical illustrations
- Packaging and label wrapping tools
- Jewelry, automotive and industrial-design surfacing tools
- AR export (USDZ/glTF) and web 3D viewers

## 30. Motion Graphics and 2D/3D Hybrid Tools
- Cloner/instance arrays and effectors
- Fields and falloffs
- Text/3D text with extrusion, bevel and per-character animation
- Spline/vector import (SVG, AI)
- Grease pencil/2D drawing in 3D space
- Toon/outline rendering
- Procedural animation/mograph presets
- Audio-reactive animation
- Volume builder and metaballs
- Camera-mapped 2.5D workflows
- Procedural shape and pattern generators

## 31. AI-Assisted and Emerging Features
- Text-to-3D and image-to-3D mesh generation
- AI texture and material generation
- AI auto-retopology, auto-UV and auto-rigging
- AI denoising and upscaling
- AI motion and animation generation, mocap cleanup
- Audio-to-face animation
- AI-assisted rotoscoping and masking
- Generative scene layout and scattering
- Gaussian splatting and NeRF capture
- Neural rendering and AI-driven viewport previews
- Natural-language command/assistant interfaces
- Smart selection and segmentation of meshes

## 32. Collaboration, Asset Management and Production
- Cloud project sharing and live multi-user editing
- Version history, branching and rollback
- Review/annotation tools and playlists
- Asset libraries, tagging, metadata and search
- Task, shot and asset tracking
- Render-farm and cloud-compute integration
- License and seat management
- Pipeline-level validation and publishing
- USD-based layered scene assembly
- Dependency tracking and relinking

---

# PART B: UI LAYOUTS, KEYBINDS AND CONTROLS

## B1. Universal Conventions

These behave the same in nearly every 3D (and creative) application.

| Action | Common binding |
|---|---|
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) |
| Save / Save As | `Ctrl+S` / `Ctrl+Shift+S` |
| Open / New | `Ctrl+O` / `Ctrl+N` |
| Copy / Paste / Cut | `Ctrl+C` / `Ctrl+V` / `Ctrl+X` |
| Select all | `Ctrl+A` |
| Delete | `Delete` / `X` (Blender) / `Backspace` |
| Duplicate | `Ctrl+D` (Maya, C4D, Unity) / `Shift+D` (Blender) |
| Frame selection | `F` (Maya, Unreal, Unity, ZBrush) / `Numpad .` (Blender) / `Z` (Max) |
| Hide / show | `H` family (varies) |
| Search commands | `F3` (Blender), `Shift+C` (C4D), `Tab` (Houdini nodes) |
| Mouse wheel | Zoom (nearly universal) |
| Right-click | Context menu / marking menu / quad menu |
| Escape | Cancel current operation |
| Enter | Confirm operation |

---

## B2. Common Layout Archetypes

1. **Quad view:** four viewports (Top, Front, Side, Perspective). Standard in 3ds Max, Maya, C4D, Houdini. Toggle a single maximized view.
2. **One large viewport with side panels:** Blender, ZBrush, Substance Painter, Marvelous Designer.
3. **Left toolbar + center viewport + right properties:** Blender, Substance, Unreal/Unity details panels.
4. **Top shelf/ribbon + viewport + bottom timeline:** Maya (shelf), 3ds Max (ribbon), C4D (command palette).
5. **Hierarchy (left) + viewport (center) + inspector (right) + asset browser (bottom):** Unreal, Unity, Godot, Fusion-style engines.
6. **Network/node editor + viewport + parameters:** Houdini, Blender geometry nodes/shaders, C4D node editor.
7. **Split 2D pattern window + 3D garment window:** Marvelous Designer, CLO.
8. **Dedicated task-based workspaces/tabs:** Blender workspaces, Maya workspaces, C4D layouts, Houdini desktops.
9. **Layer stack + properties + shelf:** Substance Painter, Photoshop-style texturing.

---

## B3. Per-Application Layouts

### Blender
- **3D Viewport** (center) with **Toolbar** (`T`, left) and **Sidebar** (`N`, right) for transform and item properties
- **Outliner** (top right) and **Properties Editor** (bottom right: tool, render, output, view layer, scene, world, object, modifiers, particles, physics, constraints, data, material, texture tabs)
- **Timeline** along the bottom
- **Header bars** per editor; editor-type switcher in the top-left of every area
- **Workspace tabs** across the top: Layout, Modeling, Sculpting, UV Editing, Texture Paint, Shading, Animation, Rendering, Compositing, Geometry Nodes, Scripting
- Every area can be split, joined, swapped or maximized (`Ctrl+Space`)
- Editors include: 3D Viewport, UV Editor, Image Editor, Shader Editor, Geometry Node Editor, Compositor, Texture Node Editor, Video Sequencer, Movie Clip Editor, Dope Sheet, Timeline, Graph Editor, Drivers, Nonlinear Animation, Text Editor, Python Console, File Browser, Asset Browser, Spreadsheet, Info

### Maya
- **Menu sets** (Modeling, Rigging, Animation, FX, Rendering) switched from the top-left dropdown
- **Shelf** with tabbed tool icons
- **Viewport** with **Panel menu** and **View/Shading/Lighting/Show/Renderer** menus
- **Toolbox** on the left (Select, Move, Rotate, Scale + layout shortcuts)
- **Channel Box / Layer Editor** and **Attribute Editor** on the right; **Modeling Toolkit** and **Tool Settings**
- **Outliner**, **Hypergraph**, **Node Editor**, **Hypershade**, **UV Editor**, **Graph Editor**, **Dope Sheet**
- **Time Slider and Range Slider** along the bottom with **Command Line / Script Editor**
- **Workspaces** (Modeling – Standard, Sculpting, Rigging, Animation, Rendering, UV Editing, Blue Pencil, etc.)

### 3ds Max
- **Ribbon** (Modeling, Graphite tools, Freeform, Selection, Object Paint) across the top
- **Command Panel** (right) with tabs: Create, Modify, Hierarchy, Motion, Display, Utilities
- **Quad menu** (right-click) and **Main toolbar**
- **Viewport Layout tabs** and 4-view default
- **Scene Explorer**, **Layer Explorer**, **Material Editor** (Slate and Compact), **Schematic View**, **Curve Editor / Dope Sheet (Track View)**
- **Time slider**, **Animation controls**, **Status bar with Coordinate display**, **MAXScript Listener**

### Cinema 4D
- **Viewport** center with **Mode/Tool palettes** on the left and **Command bar** across the top
- **Object Manager** (top right), **Attribute Manager** (bottom right), **Coordinates Manager**
- **Material Manager** and **Timeline** at the bottom; **Content Browser** and **Layer Manager** as tabs
- **Layouts**: Standard, Model, Sculpt, UV Edit, Paint, Animate, Node Editor, Scene Nodes, etc.
- **Picture Viewer** for renders; **Commander** (`Shift+C`) for command search

### ZBrush
- **Canvas** (center) with **Top Shelf** (brush, stroke, alpha, texture, material, draw controls)
- **Left Shelf** (Brush, Stroke, Alpha, Texture, Material, Color selectors, Gizmo, Draw size and intensity)
- **Right Shelf** (Local, Frame, Move/Scale/Rotate, Polyframe, Transparency, Solo, Dynamic Subdiv, Floor)
- **Tool Palette** and **SubTool palette** (stack of meshes), **Geometry palette** (Divide, Dynamesh, ZRemesher), **Masking**, **Polygroups**, **Layers**, **Deformation**, **Surface**, **Zplugin**
- **Lightbox** (project/file browser)
- **Palette and menu bar** across the top, hotbox on `Space`; custom menus supported

### Houdini
- **Scene View** (3D viewport), **Network Editor** (node graph), **Parameters Pane**, **Geometry Spreadsheet**, **Scene Graph Tree** (Solaris), **Animation Editor**, **Material Palette**, **Take List**, **Render View**, **Composite View**
- **Desktops** (Build, Animate, Technical, Lookdev, Solaris, Karma, Tabs, etc.)
- **Contexts**: OBJ, SOP, DOP, VOP, CHOP, COP, LOP, TOP, ROP; nodes are created with `Tab`
- Pane tabs can be swapped for any pane type

### Substance 3D Painter
- **3D Viewport** and **2D UV Viewport** (toggle or split)
- **Layers panel**, **Properties panel** (brush/filter/fill settings), **Shelf** (assets, materials, brushes, alphas, filters, procedurals, environments)
- **Texture Set List** and **Texture Set Settings**
- **Display Settings**, **Viewer Settings**, **Bake Mesh Maps** window, **Export** dialog
- **Toolbar** (paint, eraser, projection, polygon fill, smudge, clone, material picker, selection)

### Marvelous Designer / CLO
- **2D Pattern Window** (left) and **3D Garment Window** (right)
- **Object Browser** and **Property Editor** (fabric, pattern, avatar, simulation settings)
- **Toolbars** for Transform, Polygon, Curve, Internal polygon, Seam, Sewing, Pin and simulation play/pause

### Unreal Engine
- **Viewport** center, **Place Actors** and **Modes** panel (left), **Outliner** (top right), **Details** (right)
- **Content Browser** (docked bottom, `Ctrl+Space` to toggle drawer)
- **Toolbar** with Play, Platforms, Source Control, Settings
- Standalone editors: Material, Niagara, Blueprint, Animation, Sequencer, Skeletal Mesh, Static Mesh, MetaHuman

### Unity
- **Scene View** and **Game View** tabs, **Hierarchy** (left), **Inspector** (right), **Project** and **Console** (bottom)
- **Toolbar** with Play/Pause/Step, **Package Manager**, **Animation/Animator** windows, **Shader Graph**, **VFX Graph**, **Timeline**

### Godot (reference)
- Scene tree (left), 2D/3D/Script/AssetLib workspaces (top center), Inspector (right), FileSystem (bottom left), Output/Debugger (bottom)

---

## B4. Navigation Schemes

| Scheme | Orbit | Pan | Zoom | Used by |
|---|---|---|---|---|
| **Blender default** | `MMB` drag | `Shift+MMB` | `Scroll` / `Ctrl+MMB` | Blender |
| **Maya style** | `Alt+LMB` | `Alt+MMB` | `Alt+RMB` / `Scroll` | Maya, Blender (Industry Compatible), ZBrush (variant), Substance Painter, Unreal, Unity |
| **Max style** | `Alt+MMB` | `MMB` drag | `Scroll` / `Ctrl+Alt+MMB` | 3ds Max |
| **C4D style** | `Alt+LMB` (or hold `3`+`LMB`) | `Alt+MMB` (or `1`+`LMB`) | `Alt+RMB` (or `2`+`LMB`) | Cinema 4D |
| **Houdini** | `Alt+LMB` or `Space+LMB` | `Alt+MMB` or `Space+MMB` | `Alt+RMB` or `Space+RMB` | Houdini |
| **ZBrush** | `LMB` drag on empty canvas | `Alt+LMB` | `Alt+LMB` then release `Alt` while dragging | ZBrush |
| **Game-engine fly** | Hold `RMB` + `W/A/S/D`, `Q/E` for down/up, scroll to change speed | | | Unreal, Unity, Godot |
| **Touchpad/trackpad** | `Alt+click` / emulated 3-button / two-finger gestures | | | most apps |

**Canonical view hotkeys (Blender numpad):**
`1` front, `3` right, `7` top, `Ctrl+` any of those for back/left/bottom, `5` toggles perspective/ortho, `0` camera view, `.` frame selected, `Home` frame all, `/` local view (isolate), `` ` `` view pie menu.

**Other apps:**
- Maya: `F` frame selection, `A` frame all, spacebar toggles single/4-view
- 3ds Max: `P` perspective, `T` top, `F` front, `L` left, `B` bottom, `C` camera, `Alt+W` maximize viewport
- Cinema 4D: `F1` perspective, `F2` top, `F3` right, `F4` front, `F5` four views
- Unreal / Unity: `F` focus

---

## B5. Transform, Selection and Mode Keys Compared

| Action | Blender | Maya | 3ds Max | Cinema 4D | Unity | Unreal |
|---|---|---|---|---|---|---|
| Select tool | `W` (cycles) | `Q` | `Q` | Live Selection (`9`) | `Q` (hand) | `Q`(none) |
| Move | `G` | `W` | `W` | `E` | `W` | `W` |
| Rotate | `R` | `E` | `E` | `R` | `E` | `E` |
| Scale | `S` | `R` | `R` | `T` | `R` | `R` |
| Axis constrain | `X/Y/Z` after G/R/S | click gizmo handle | `F5/F6/F7` | click gizmo handle | click gizmo handle | click gizmo handle |
| Snap toggle | `Shift+Tab` | `X` grid, `C` curve, `V` point (hold) | `S` | `Shift+...` / snap panel | `Ctrl` (hold) | `Ctrl` (hold) |
| Vertex mode | `1` | `F9` | `1` | Points mode icon | n/a | n/a |
| Edge mode | `2` | `F10` | `2` | Edges mode icon | n/a | n/a |
| Face / Polygon mode | `3` | `F11` | `4` | Polygons mode icon | n/a | n/a |
| Object/component toggle | `Tab` | `F8` | `6`? (sub-object exit, `Ctrl+B`) | click mode icon | n/a | n/a |
| Isolate | `/` | `Ctrl+1`? (Show > Isolate Select) | `Alt+Q` | `Alt+V`? (Solo) | n/a | n/a |
| Duplicate | `Shift+D` | `Ctrl+D` | `Ctrl+V` / `Shift+drag` | `Ctrl+drag` | `Ctrl+D` | `Alt+drag` |
| Group / parent | `Ctrl+P` parent | `Ctrl+G` group | Link tool | `Alt+G` group | drag in hierarchy | drag in outliner |
| Hide | `H` | `Ctrl+H` | `Alt+H`? (varies) | `Alt+H`? (varies) | `Alt+Shift+A` toggle active | `H` |
| Select loop | `Alt+LMB` on edge | `Double-click` edge | `Alt+L` (loop) | `U~L` | n/a | n/a |
| Select ring | `Ctrl+Alt+LMB` | `Ctrl+Double-click`? | `Alt+R` (ring) | `U~B` | n/a | n/a |
| Grow / shrink selection | `Ctrl+Numpad +/-` | `>` / `<` | `Ctrl+PgUp/PgDn` | `U~Y`/`U~K` | n/a | n/a |
| Invert selection | `Ctrl+I` | `Ctrl+Shift+I`? / Select menu | `Ctrl+I` | `U~I` | n/a | n/a |
| Select linked | `L` / `Ctrl+L` | `Ctrl+Shift+>` ish | Select Element | Path Select | n/a | n/a |

> Cells with `?` are known to vary by version/preset. Verify in the keymap editor before relying on them.

Gestures common to all: `Shift+click` add to selection, `Ctrl+click` subtract/toggle (varies), drag box/lasso/paint select.

---

## B6. Modeling Shortcuts

### Blender (Edit Mode defaults)
| Tool | Key |
|---|---|
| Add object | `Shift+A` |
| Extrude | `E` |
| Inset faces | `I` |
| Bevel | `Ctrl+B` (`Ctrl+Shift+B` for vertices) |
| Loop cut and slide | `Ctrl+R` |
| Knife | `K` |
| Merge | `M` (merge menu) |
| Fill / Make face | `F` |
| Connect vertex path | `J` |
| Delete menu | `X` / `Delete` |
| Separate | `P` |
| Join objects | `Ctrl+J` |
| Subdivide (preview levels) | `Ctrl+1` to `Ctrl+5` |
| Smooth / flat shading | RMB menu |
| Proportional editing | `O` |
| Select menu: all / none / invert | `A` / `Alt+A` / `Ctrl+I` |
| Hide / reveal | `H` / `Alt+H` |
| Mesh context menus | `Ctrl+V` vertex, `Ctrl+E` edge, `Ctrl+F` face |
| Apply transforms | `Ctrl+A` |
| Repeat last | `Shift+R` |
| Mode pie | `Ctrl+Tab` |
| Shading pie | `Z` |
| Snap pie | `Shift+S` |
| Pivot pie | `.` |
| Orientation pie | `,` |

### Maya (Polygon modeling)
| Tool | Key / location |
|---|---|
| Extrude | `Ctrl+E` (modern versions) |
| Bevel | `Ctrl+B` |
| Multi-Cut | Mesh Tools menu / shelf (no default hotkey) |
| Insert Edge Loop | Hotbox / marking menu |
| Delete edge/vertex (clean) | `Ctrl+Delete` |
| Smooth preview | `1` (cage) / `2` (cage + smooth) / `3` (smooth) |
| Wireframe / shaded / textured | `4` / `5` / `6` |
| Hotbox | Hold `Space` |
| Duplicate | `Ctrl+D` |
| Group | `Ctrl+G` |
| Center pivot | Modify menu |
| Edit pivot | `Insert` / `D` |

### 3ds Max (Editable Poly)
| Tool | Key |
|---|---|
| Sub-object levels | `1` vertex, `2` edge, `3` border, `4` polygon, `5` element |
| Extrude | `Shift+E` |
| Cut | `Alt+C` |
| Connect | Ribbon / quad menu |
| Isolate selection | `Alt+Q` |
| X-ray | `Alt+X` |
| Maximize viewport | `Alt+W` |
| Wireframe toggle | `F3` |
| Edged faces | `F4` |

### Cinema 4D
| Tool | Key |
|---|---|
| Make editable | `C` |
| Tool menu popup | `M` |
| Commander (search) | `Shift+C` |
| Swap last tool | `Space` |
| Hide / show | `Alt+H` family (varies) |

### ZBrush
| Action | Key |
|---|---|
| Subdivide up / down | `D` / `Shift+D` |
| Draw size | `S` |
| Frame model | `F` |
| Edit mode toggle | `T` |
| Draw / Move / Scale / Rotate modes | `Q` / `W` / `E` / `R` |
| Brush palette popup | `B` |
| Symmetry X / Y / Z | `X` / `Y` / `Z` |

---

## B7. Sculpting Controls

| Action | Blender | ZBrush | Notes |
|---|---|---|---|
| Brush size | `F` then drag | `S` / `[` `]` | Universal convention |
| Brush strength | `Shift+F` then drag | `Z`-intensity (slider) | |
| Smooth brush | Hold `Shift` | Hold `Shift` | Temporary smooth override |
| Invert/subtract | Hold `Ctrl` | Hold `Alt` | Reverses brush direction |
| Mask paint | Mask brush (`M` in some keymaps) | Hold `Ctrl` and drag | |
| Invert mask | Mask menu | `Ctrl+click` background | |
| Clear mask | `Alt+M` | `Ctrl+drag` empty area | |
| Hide / isolate | `Shift+H`, `H` (varies) | `Ctrl+Shift` drag | |
| Voxel remesh | `Ctrl+R` | Dynamesh button | |
| Symmetry | Header toggles X/Y/Z | `X/Y/Z` | |
| Brush selection | Toolbar / `Shift+Space` search | `B` then letters | |
| Frame model | `Numpad .` | `F` | |

---

## B8. Animation and Playback Keys

| Action | Blender | Maya | 3ds Max | Cinema 4D |
|---|---|---|---|---|
| Play / pause | `Space` | `Alt+V` | `/` | `F6` / `Ctrl+Space`? |
| Next / previous frame | `→` / `←` | `.` / `,` | `.` / `,` | `→` / `←`? |
| Next / previous keyframe | `↑` / `↓` | `Alt+.` / `Alt+,`? | `Ctrl+.` ? | varies |
| First / last frame | `Shift+←` / `Shift+→` | `Alt+Shift+V` | `Home` / `End` | varies |
| Insert key | `I` | `S` | `K` (set key) | `F9` |
| Auto-key | Timeline record button | Auto-key toggle | `N` | Record |
| Key translate/rotate/scale | `I` menu | `Shift+W/E/R` | `K` | `F9` |
| Scrub | Drag timeline | Hold `K` + drag | Drag time slider | Drag timeline |
| Graph editor | Editor-type switch | Windows menu | Curve Editor | Timeline Function Curves |

> `?` entries differ between versions/presets. Verify.

---

## B9. Rendering Shortcuts

| Action | Blender | Maya | 3ds Max | Cinema 4D | Unreal |
|---|---|---|---|---|---|
| Render still | `F12` | Render menu | `F9` / `Shift+Q` | `Ctrl+R` | n/a |
| Render animation | `Ctrl+F12` | Batch Render | Render Setup (`F10`) | Render Settings (`Ctrl+B`) | Movie Render Queue |
| View render | `F11` | Render View | Rendered Frame Window | Picture Viewer | n/a |
| Rendered viewport | `Z` pie / header | Renderer menu | ActiveShade | IPR | Lit / Path Tracer |
| Render settings | Properties editor | Render Settings | `F10` | `Ctrl+B` | Project Settings |
| Camera view | `Numpad 0` | Panels menu | `C` | `F1` + camera object | pilot camera |
| Material editor | Shader Editor | Hypershade | `M` | Material Manager | Material Editor |

---

## B10. Radial, Pie, Marking and Quad Menus

| Menu type | App | Trigger | Notes |
|---|---|---|---|
| **Pie menus** | Blender | `Z` shading, `Shift+S` snap, `` ` `` view, `Ctrl+Tab` mode, `.` pivot, `,` orientation | Gesture-driven, fast |
| **Marking menus** | Maya | Hold `RMB` (context), hold `Space` (hotbox), `Ctrl+Shift+RMB` | Flick gestures |
| **Hotbox** | Maya | Hold `Space` | Full-menu overlay |
| **Quad menu** | 3ds Max | `RMB` | Four context quadrants |
| **Popup menu** | Cinema 4D | `RMB` / `M` for modeling tools / `Shift+C` commander | |
| **Radial menus** | Houdini | Key-activated (`S`, `W`, etc.), `RMB` | Configurable |
| **Brush popup** | ZBrush | `B` then letter / `Space` | Alphabetical filtering |
| **Search** | Blender `F3`, C4D `Shift+C`, Houdini `Tab`, Unreal `Ctrl+Shift+P`? | | |

---

## B11. Node Editor Conventions

| Action | Typical binding |
|---|---|
| Add node | `Shift+A` (Blender), `Tab` (Houdini), RMB menu or `Tab` (Maya/Unreal) |
| Connect | Drag from output socket to input socket |
| Disconnect | Drag off or `Ctrl+RMB` cut (Blender) |
| Box select | LMB drag in empty space |
| Move / pan canvas | `MMB` drag or `Alt+MMB` |
| Zoom canvas | Scroll wheel |
| Frame all / selected | `Home` / `F` or `.` |
| Group nodes | `Ctrl+G` (Blender), Digital Assets (Houdini) |
| Preview node output | `Ctrl+Shift+LMB` (Blender Node Wrangler), blue/display flag (Houdini) |
| Mute / bypass | `M` (Blender), bypass flag (Houdini) |
| Rename | `F2` |

---

## B12. Tablet and Pen Controls

- **Pressure** maps to size, strength, flow, opacity (configurable)
- **Tilt/rotation** drives brush angle (ZBrush, Painter, Blender with supported tablets)
- **Pen buttons** are mapped to `MMB` / `RMB` to enable pen-only navigation
- **Lazy mouse / stabilizer** smooths strokes in sculpt and paint
- **Touch gestures** (two-finger pan/zoom, pinch) exist in Blender, ZBrush (iPad), Nomad, Shapr3D
- **Radial brush resize** (hold key and drag) is common across apps

---

## B13. Coordinate Systems and Axis Colors

| App | Up axis | Handedness | Axis colors |
|---|---|---|---|
| Blender | Z-up | Right-handed | X red, Y green, Z blue |
| Maya | Y-up (configurable) | Right-handed | X red, Y green, Z blue |
| 3ds Max | Z-up | Right-handed | X red, Y green, Z blue |
| Cinema 4D | Y-up | Left-handed | X red, Y green, Z blue |
| Houdini | Y-up | Right-handed | X red, Y green, Z blue |
| ZBrush | Y-up | Right-handed | X red, Y green, Z blue |
| Unreal | Z-up | Left-handed | X red, Y green, Z blue |
| Unity | Y-up | Left-handed | X red, Y green, Z blue |

Axis conversion on import/export (Y-up ↔ Z-up, handedness flips) is a very common source of bugs.

---

## B14. Keymap Presets Worth Supporting

A modern 3D application should ship selectable presets so users can bring their muscle memory:

1. **Blender default** (G/R/S, MMB orbit, pie menus)
2. **Maya** (QWER, Alt+mouse nav, marking menus)
3. **3ds Max** (QWER, Alt+MMB orbit, quad menu)
4. **Cinema 4D** (ERT, `1/2/3` + mouse nav)
5. **ZBrush** (sculpt brush hotkeys, `Alt`/`Shift` modifiers)
6. **Houdini** (`Space`-based navigation)
7. **Unreal / Unity style** (RMB fly, QWER gizmo)
8. **Substance Painter** (paint hotkeys, `Alt` nav)
9. **Industry Compatible** (Blender's own Maya-like preset)
10. **Custom** with a searchable keymap editor, conflict detection, import/export of keymaps

Also provide: navigation preference (orbit around selection vs. around view center), invert zoom, zoom-to-mouse-position, emulate-3-button-mouse, per-tool modifier toggles, and customizable pie/radial menus.
