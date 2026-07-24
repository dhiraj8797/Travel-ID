"""Shrink bundled image assets for smaller APKs. Safe to re-run."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

# (path, max_edge, format, quality) — format jpeg may rewrite .png -> .jpg
TARGETS = [
    ("assets/scenes/pass-bg-train.jpg", 1440, "jpeg", 78),
    ("assets/scenes/pass-bg-bus.jpg", 1440, "jpeg", 78),
    ("assets/vehicles/live-hero-vande.png", 1200, "png", 0),
    ("assets/vehicles/hero-bus.png", 800, "png", 0),
    ("assets/vehicles/hero-flight.png", 800, "png", 0),
    ("assets/vehicles/hero-vande-bharat.png", 800, "png", 0),
    ("assets/vehicles/vande-loco.png", 640, "png", 0),
    ("assets/vehicles/vande-coach.png", 640, "png", 0),
    ("assets/sky/sky-sun.png", 384, "png", 0),
    ("assets/sky/sky-moon.png", 384, "png", 0),
    ("assets/icon.png", 432, "png", 0),
    ("assets/adaptive-icon.png", 432, "png", 0),
    ("assets/android-icon-foreground.png", 432, "png", 0),
    ("assets/travel-id-logo.png", 432, "png", 0),
    ("assets/splash-icon.png", 432, "png", 0),
    ("assets/heroes/train.jpg", 1080, "jpeg", 78),
    ("assets/heroes/bus.jpg", 1080, "jpeg", 78),
    ("assets/scenes/passes-settings-bg.jpg", 1440, "jpeg", 78),
    ("assets/scenes/flight-pass-hero.jpg", 1200, "jpeg", 78),
]


def resize_max(im: Image.Image, max_edge: int) -> Image.Image:
    w, h = im.size
    m = max(w, h)
    if m <= max_edge:
        return im
    scale = max_edge / m
    return im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)


def to_rgb(im: Image.Image) -> Image.Image:
    if im.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", im.size, (8, 16, 32))
        rgba = im.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    if im.mode != "RGB":
        return im.convert("RGB")
    return im


def save_png(im: Image.Image, path: Path) -> None:
    if im.mode not in ("RGBA", "RGB", "L", "LA"):
        im = im.convert("RGBA")
    im.save(path, format="PNG", optimize=True)


def save_jpeg(im: Image.Image, path: Path, quality: int) -> None:
    to_rgb(im).save(path, format="JPEG", quality=quality, optimize=True, progressive=True)


def main() -> None:
    total_before = 0
    total_after = 0
    for rel, max_edge, fmt, quality in TARGETS:
        path = ROOT / rel
        if not path.exists():
            print(f"skip missing {rel}")
            continue
        before = path.stat().st_size
        total_before += before
        im = resize_max(Image.open(path), max_edge)

        if fmt == "jpeg" and path.suffix.lower() == ".png":
            out = path.with_suffix(".jpg")
            save_jpeg(im, out, quality)
            path.unlink(missing_ok=True)
            after = out.stat().st_size
            print(f"{rel} -> {out.name}: {before/1024:.0f}KB -> {after/1024:.0f}KB ({im.size[0]}x{im.size[1]})")
        elif fmt == "jpeg":
            save_jpeg(im, path, quality)
            after = path.stat().st_size
            print(f"{rel}: {before/1024:.0f}KB -> {after/1024:.0f}KB ({im.size[0]}x{im.size[1]})")
        else:
            save_png(im, path)
            after = path.stat().st_size
            print(f"{rel}: {before/1024:.0f}KB -> {after/1024:.0f}KB ({im.size[0]}x{im.size[1]})")
        total_after += after

    print(f"TOTAL: {total_before/1024/1024:.2f}MB -> {total_after/1024/1024:.2f}MB")


if __name__ == "__main__":
    main()
