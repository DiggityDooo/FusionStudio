"""Assemble docs/showcase/frames/*.png (written by tests/showcase.cjs) into demo-sculpt.gif."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ROOT / 'docs' / 'showcase' / 'frames'
OUT = ROOT / 'docs' / 'showcase' / 'demo-sculpt.gif'


def main():
    files = sorted(FRAMES.glob('f*.png'))
    if len(files) < 4:
        raise SystemExit(f'Need at least 4 frames in {FRAMES}, found {len(files)}')
    images = []
    for file in files:
        image = Image.open(file).convert('RGB')
        image.thumbnail((900, 900))
        images.append(image)
    images[0].save(OUT, save_all=True, append_images=images[1:], duration=140, loop=0, optimize=True)
    print(f'Wrote {OUT} from {len(images)} frames')

    steps = sorted((ROOT / 'docs' / 'showcase').glob('w*.png'))
    if len(steps) >= 4:
        workflow = []
        for file in steps:
            image = Image.open(file).convert('RGB')
            image.thumbnail((1000, 1000))
            workflow.append(image)
        target = ROOT / 'docs' / 'showcase' / 'demo-workflow.gif'
        workflow[0].save(target, save_all=True, append_images=workflow[1:], duration=1200, loop=0, optimize=True)
        print(f'Wrote {target} from {len(workflow)} workflow steps')


if __name__ == '__main__':
    main()
