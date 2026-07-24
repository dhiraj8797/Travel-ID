from PIL import Image
import numpy as np

src = r"C:\Users\dhira\Wallet\assets\travel-id-logo.png"
img = Image.open(src).convert("RGBA")
arr = np.array(img).astype(np.float32)
r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

# Anti-aliased dark fringe on outer edge
fringe = (a > 8) & (a < 252) & (lum < 60)
dark_edge = (a > 180) & (lum < 45) & (r < 90) & (g < 90) & (b < 90)
mask = fringe | dark_edge
arr[mask, 3] = 0

h, w = arr.shape[:2]
inset = 3
out = Image.fromarray(arr.astype(np.uint8), "RGBA")
core = out.crop((inset, inset, w - inset, h - inset)).resize(
    (w, h), Image.Resampling.LANCZOS
)
core.save(src)
print(f"cleaned {int(mask.sum())} fringe pixels, inset-scaled, saved {src}")
