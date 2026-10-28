"""Translate explicitly identified Fusion glTF seconds into Blender frames.

Ordinary third-party glTF files retain the importer's timing convention. Only
Fusion's versioned animation sidecar establishes an authoring rate and origin.
"""
import json
import math
import struct
from pathlib import Path


def fusion_animation_timing(file):
    path = Path(file)
    if path.suffix.lower() not in ('.glb', '.gltf'):
        return None
    with path.open('rb') as stream:
        if path.suffix.lower() == '.glb':
            header = stream.read(20)
            if len(header) != 20:
                raise ValueError('Truncated animation GLB header.')
            magic, version, total, length, kind = struct.unpack('<5I', header)
            if magic != 0x46546C67 or version != 2 or kind != 0x4E4F534A or length > 32 * 1024 * 1024 or length + 20 > total:
                raise ValueError('Invalid or oversized animation GLB metadata.')
            raw = stream.read(length)
        else:
            raw = stream.read(32 * 1024 * 1024 + 1)
            if len(raw) > 32 * 1024 * 1024:
                raise ValueError('Animation glTF metadata exceeds 32 MiB.')
    document = json.loads(raw)
    scenes = document.get('scenes', [])
    selected = document.get('scene', 0)
    if not isinstance(selected, int) or not 0 <= selected < len(scenes):
        return None
    report = scenes[selected].get('extras', {}).get('fusion_animation_export')
    if report is None:
        return None
    if not isinstance(report, dict) or report.get('version') != 1 or report.get('frameOrigin', 1) != 1:
        raise ValueError('Unsupported Fusion animation timing sidecar.')
    fps = report.get('fps')
    if isinstance(fps, bool) or not isinstance(fps, (int, float)) or not math.isfinite(fps) or not 0 < fps <= 240:
        raise ValueError('Invalid Fusion animation frame rate.')
    timing = {'version': 1, 'fps': fps, 'frameOrigin': 1}
    if 'start' in report or 'end' in report:
        start, end = report.get('start'), report.get('end')
        if type(start) is not int or type(end) is not int or not 1 <= start <= end <= 1000000:
            raise ValueError('Invalid Fusion animation frame range.')
        timing.update(start=start, end=end)
    return timing


def action_curves(action):
    curves = list(getattr(action, 'fcurves', []))
    for layer in getattr(action, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                curves.extend(bag.fcurves)
    return {curve.as_pointer(): curve for curve in curves}.values()


def align_fusion_animation(scene, data, actions, timing, requested_fps=None):
    if not timing:
        return None
    imported_fps = scene.render.fps / scene.render.fps_base
    target_fps = requested_fps if requested_fps is not None else timing['fps']
    if not isinstance(target_fps, (int, float)) or not math.isfinite(target_fps) or not 0 < target_fps <= 240:
        raise ValueError('Invalid animation delivery frame rate.')
    scale = target_fps / imported_fps
    shift = timing['frameOrigin']
    scene.render.fps = max(1, round(target_fps))
    scene.render.fps_base = scene.render.fps / target_fps
    count = 0
    for action in actions:
        for curve in action_curves(action):
            for key in curve.keyframe_points:
                key.co.x = key.co.x * scale + shift
                key.handle_left.x = key.handle_left.x * scale + shift
                key.handle_right.x = key.handle_right.x * scale + shift
                count += 1
            curve.update()
    # Stashed actions must keep their placement and source range together.
    for collection in ('objects', 'shape_keys', 'materials', 'cameras', 'lights', 'node_groups'):
        for owner in getattr(data, collection, []):
            animation = getattr(owner, 'animation_data', None)
            if not animation:
                continue
            for track in animation.nla_tracks:
                for strip in track.strips:
                    if strip.action not in actions:
                        continue
                    start, end, a, b = strip.frame_start, strip.frame_end, strip.action_frame_start, strip.action_frame_end
                    strip.action_frame_start = a * scale + shift
                    strip.action_frame_end = b * scale + shift
                    strip.frame_start = start * scale + shift
                    strip.frame_end = end * scale + shift
    scene.frame_set(shift)
    if 'start' in timing:
        scene.frame_start = math.floor((timing['start'] - 1) * target_fps / timing['fps'] + shift)
        scene.frame_end = math.ceil((timing['end'] - 1) * target_fps / timing['fps'] + shift)
    return {**timing, 'deliveryFps': target_fps, 'keysShifted': count}
