"""Remove solid studio backgrounds from vehicle hero PNGs."""
from __future__ import annotations

import os
from PIL import Image


def make_transparent(src: str, dst: str, threshold: int = 42) -> None:
    im = Image.open(src).convert("RGBA")
    pixels = im.load()
    w, h = im.size
    corners = [
        (2, 2),
        (w - 3, 2),
        (2, h - 3),
        (w - 3, h - 3),
        (w // 2, 2),
        (w // 2, h - 3),
        (2, h // 2),
        (w - 3, h // 2),
    ]
    colors = [pixels[x, y][:3] for x, y in corners]
    br = sum(c[0] for c in colors) // len(colors)
    bg = sum(c[1] for c in colors) // len(colors)
    bb = sum(c[2] for c in colors) // len(colors)
    print(f"{src} bg~{(br, bg, bb)} size={w}x{h}")

    out = Image.new("RGBA", (w, h))
    op = out.load()
    soft = threshold * 2
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            dist = abs(r - br) + abs(g - bg) + abs(b - bb)
            if dist < soft:
                if dist < threshold:
                    alpha = 0
                else:
                    alpha = int(255 * (dist - threshold) / (soft - threshold))
                op[x, y] = (r, g, b, max(0, min(255, alpha)))
            else:
                op[x, y] = (r, g, b, a)

    # Crop to opaque content with padding
    bbox = out.getbbox()
    if bbox:
        pad = 8
        left = max(0, bbox[0] - pad)
        top = max(0, bbox[1] - pad)
        right = min(w, bbox[2] + pad)
        bottom = min(h, bbox[3] + pad)
        out = out.crop((left, top, right, bottom))

    out.save(dst, optimize=True)
    print(f"saved {dst} ({os.path.getsize(dst)} bytes, {out.size})")


if __name__ == "__main__":
    root = os.path.join(os.path.dirname(__file__), "..", "assets", "vehicles")
    for name in ("hero-train.png", "hero-bus.png"):
        path = os.path.abspath(os.path.join(root, name))
        # backup once
        bak = path.replace(".png", ".orig.png")
        if not os.path.exists(bak):
            Image.open(path).save(bak)
        make_transparent(bak, path, threshold=45)
