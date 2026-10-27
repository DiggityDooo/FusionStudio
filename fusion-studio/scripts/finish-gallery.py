"""Assemble the silent README reel and verify published documentation media.

Requires Pillow plus FUSION_MEDIA_FFMPEG or the workspace-local encoder used by
capture-gallery.cjs. All generated frames/tools remain in ignored test-output.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / 'test-output/github-showcase'
OUT = ROOT / 'docs/showcase/2026-10-26'
FFMPEG = Path(os.environ.get('FUSION_MEDIA_FFMPEG', str(ROOT / 'test-output/media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))


def run(args):
    p = subprocess.run([str(FFMPEG), '-y', '-hide_banner', *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if p.returncode:
        raise RuntimeError(p.stderr)
    return p


def reel():
    sources = [('native-01', 2, 6), ('sculpt-01', 0, 5), ('character-06', 0, 4), ('native-02', 7, 11)]
    args, filters = [], []
    for i, (name, start, end) in enumerate(sources):
        args += ['-i', str(SCRATCH / (name + '.mp4'))]
        filters.append(f'[{i}:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,scale=960:540:flags=lanczos,fps=8,setsar=1[v{i}]')
    streams = ''.join(f'[v{i}]' for i in range(len(sources)))
    filters += [f'{streams}concat=n={len(sources)}:v=1:a=0,split[a][b]', '[a]palettegen=max_colors=192[p]', '[b][p]paletteuse=dither=sierra2_4a[out]']
    run([*args, '-filter_complex', ';'.join(filters), '-map', '[out]', '-loop', '0', str(OUT / 'workflow-reel.gif')])


def chapter_metadata():
    manifest_file = OUT / 'capture-manifest.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
    for workflow in manifest['workflows']:
        metadata = [';FFMETADATA1', 'title=Fusion Studio - ' + workflow['id'] + ' workflow']
        captions, elapsed = ['WEBVTT', ''], 0
        def cue(ms):
            return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
        for chapter in workflow['chapters']:
            info = subprocess.run([str(FFMPEG), '-hide_banner', '-i', str(SCRATCH / (chapter['name'] + '.mp4'))], capture_output=True, text=True, encoding='utf-8', errors='replace').stderr
            match = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', info)
            if not match:
                raise AssertionError('Missing chapter duration: ' + chapter['name'])
            milliseconds = round((int(match[1])*3600 + int(match[2])*60 + float(match[3]))*1000)
            end = elapsed + milliseconds
            metadata += ['[CHAPTER]', 'TIMEBASE=1/1000', f'START={elapsed}', f'END={end}', 'title=' + chapter['title']]
            captions += [f'{cue(elapsed)} --> {cue(end)}', chapter['title'], chapter['subtitle'], '']
            chapter.update(startSeconds=elapsed/1000, endSeconds=end/1000)
            elapsed = end
        meta = SCRATCH / (workflow['id'] + '-chapters.txt')
        meta.write_text('\n'.join(metadata)+'\n', encoding='utf-8')
        source = OUT / workflow['video']
        result = SCRATCH / (workflow['id'] + '-chaptered.mp4')
        run(['-loglevel', 'error', '-i', str(source), '-f', 'ffmetadata', '-i', str(meta), '-map', '0:v', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-movflags', '+faststart', str(result)])
        result.replace(source)
        caption_file = source.with_suffix('.vtt')
        caption_file.write_text('\n'.join(captions), encoding='utf-8')
        workflow.update(bytes=source.stat().st_size, containerChapters=True, captions=caption_file.name)
    manifest_file.write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')


def inventory():
    records = []
    for file in sorted(OUT.iterdir()):
        if file.suffix not in ('.png', '.mp4', '.gif', '.vtt'):
            continue
        record = {'file': file.name, 'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
        if file.suffix == '.mp4':
            # Decode every frame; fail on corruption rather than only checking headers.
            result = run(['-xerror', '-i', str(file), '-f', 'null', '-'])
            info = result.stderr
            size = re.search(r'Video: h264[^\n]*?\b(\d{3,5})x(\d{3,5})\b', info)
            duration = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', info)
            if not size or not duration:
                raise AssertionError('Missing H.264 video metadata: ' + file.name)
            record.update(width=int(size[1]), height=int(size[2]), codec='H.264', fps=30,
                          seconds=round(int(duration[1])*3600 + int(duration[2])*60 + float(duration[3]), 2), decodedAllFrames=True)
            assert (record['width'], record['height']) == (1920, 1080)
            # Representative review frame, private validation output only.
            run(['-loglevel', 'error', '-ss', str(record['seconds'] * .7), '-i', str(file), '-frames:v', '1', str(SCRATCH / (file.stem + '-review.png'))])
        elif file.suffix in ('.png', '.gif'):
            with Image.open(file) as im:
                record.update(width=im.width, height=im.height, frames=getattr(im, 'n_frames', 1))
                im.verify()
        records.append(record)
    data = {'date':'2026-10-26', 'purpose':'Documentation media validation, not a full product regression certification', 'media': records}
    (OUT / 'media-inventory.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    for r in records:
        print(r['file'], r['bytes'], str(r.get('seconds', '')) + (' s' if 'seconds' in r else ''))


if __name__ == '__main__':
    reel()
    chapter_metadata()
    inventory()
