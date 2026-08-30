from pathlib import Path
from PIL import Image

JOBS = [
    ("exec-74bf1af2-d3d2-41bb-9e52-c6b117227b9e.png", "claude-shannon-research-12.webp"),
    ("exec-e7c31038-19cb-4488-bdca-51cfeabd5e5c.png", "marvin-minsky-research-12.webp"),
    ("exec-1278599c-2972-4637-b751-8e0eaa9608c6.png", "katherine-johnson-research-12.webp"),
]

SOURCE_ROOT = Path(r"C:\Users\Compliance\.codex\generated_images\01a038ef-071c-72f3-ac66-70b7232f9baf")
OUTPUT_ROOT = Path("public/heroes")

for source_name, output_name in JOBS:
    with Image.open(SOURCE_ROOT / source_name) as source:
        if source.size != (1448, 1086):
            raise SystemExit(f"{source_name}: expected 1448x1086, got {source.size}")
        frames = [
            source.crop((column * 362, row * 362, (column + 1) * 362, (row + 1) * 362))
            .resize((362, 362), Image.Resampling.NEAREST)
            .convert("RGBA")
            for row in range(3)
            for column in range(4)
        ]
        output = OUTPUT_ROOT / output_name
        frames[0].save(output, save_all=True, append_images=frames[1:], duration=[120] * 12, loop=0, lossless=False, quality=88, method=4)
    with Image.open(output) as encoded:
        print(f"{output}: {output.stat().st_size} bytes, {encoded.n_frames} frames")
