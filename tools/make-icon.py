# Erzeugt das Navi-Symbol (Kompassnadel mit Straße auf dunkelblauem Grund) in allen Android-Größen
from PIL import Image, ImageDraw, ImageFilter
import os, math
OUT = os.path.join(os.path.dirname(__file__), '..', 'android-overlay', 'res')

def art(size, full=True):
    S = size * 4; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if full:
        # Hintergrund mit Verlauf
        for y in range(S):
            t = y / S; c = (int(12 + 10 * t), int(30 + 40 * (1 - t)), int(70 + 60 * (1 - t)), 255)
            d.line([(0, y), (S, y)], fill=c)
    cx = cy = S / 2; R = S * (0.30 if not full else 0.34)
    # Ring
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(200, 225, 255, 255), width=int(S * 0.025))
    d.ellipse([cx - R * 0.93, cy - R * 0.93, cx + R * 0.93, cy + R * 0.93], outline=(47, 139, 255, 255), width=int(S * 0.012))
    # Straße
    d.polygon([(cx - R * 0.25, cy + R * 0.95), (cx + R * 0.25, cy + R * 0.95), (cx + R * 0.1, cy - R * 0.2), (cx - R * 0.1, cy - R * 0.2)], fill=(38, 52, 82, 255))
    for k in range(4):
        y0 = cy + R * (0.8 - k * 0.3); w = R * (0.035 - k * 0.006)
        d.rectangle([cx - w, y0, cx + w, y0 + R * 0.14], fill=(255, 214, 80, 255))
    # Nadel (Navi-Pfeil)
    tip = (cx, cy - R * 1.05); l = (cx - R * 0.42, cy + R * 0.55); m = (cx, cy + R * 0.25); r = (cx + R * 0.42, cy + R * 0.55)
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(sh).polygon([tip, l, m, r], fill=(0, 0, 0, 150))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(S * 0.012)), (int(S * 0.008), int(S * 0.012)))
    d = ImageDraw.Draw(im)
    d.polygon([tip, l, m, r], fill=(22, 209, 122, 255))
    d.polygon([tip, m, r], fill=(14, 160, 92, 255))
    d.line([tip, l, m, r, tip], fill=(255, 255, 255, 255), width=int(S * 0.012), joint='curve')
    return im.resize((size, size), Image.LANCZOS)

def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True); img.save(path)

for name, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    full = art(px, True)
    save(full, f'{OUT}/mipmap-{name}/ic_launcher.png')
    mask = Image.new('L', (px, px), 0); ImageDraw.Draw(mask).ellipse([0, 0, px - 1, px - 1], fill=255)
    rnd = Image.new('RGBA', (px, px), (0, 0, 0, 0)); rnd.paste(full, (0, 0), mask)
    save(rnd, f'{OUT}/mipmap-{name}/ic_launcher_round.png')
# Adaptives Symbol: Vordergrund 432 px (108 dp), sicherer Bereich in der Mitte
fg = Image.new('RGBA', (432, 432), (0, 0, 0, 0)); sym = art(432 * 1, False)
fg.alpha_composite(sym.resize((432, 432), Image.LANCZOS)); save(fg, f'{OUT}/mipmap-xxxhdpi/navi_fg.png')
os.makedirs(f'{OUT}/mipmap-anydpi-v26', exist_ok=True)
xml = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/navi_bg"/>\n    <foreground android:drawable="@mipmap/navi_fg"/>\n</adaptive-icon>\n'
for n in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    open(f'{OUT}/mipmap-anydpi-v26/{n}', 'w').write(xml)
open(f'{OUT}/values/navi_colors.xml', 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="navi_bg">#0F2547</color>\n</resources>\n')
# Vorschau
big = art(512, True); big.save('/tmp/n/icon-preview.png')
