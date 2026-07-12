# Erzeugt die PWA-Icons (isometrischer Voxel-Wuerfel) nach public/icons/.
# Benoetigt Pillow: pip install pillow
import math
from pathlib import Path

from PIL import Image, ImageDraw

BG = (6, 7, 9, 255)        # --bg
TOP = (0, 229, 255, 255)   # --accent (hellste Flaeche)
LINKS = (0, 160, 185, 255)
RECHTS = (0, 105, 128, 255)

ZIEL = Path(__file__).resolve().parent.parent / "public" / "icons"
SS = 4  # Supersampling-Faktor


def hexpunkt(cx: float, cy: float, r: float, grad: float) -> tuple[float, float]:
    a = math.radians(grad)
    return (cx + r * math.cos(a), cy - r * math.sin(a))


def zeichne_wuerfel(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    c = (cx, cy)
    v = {g: hexpunkt(cx, cy, r, g) for g in (30, 90, 150, 210, 270, 330)}
    d.polygon([c, v[150], v[90], v[30]], fill=TOP)
    d.polygon([c, v[150], v[210], v[270]], fill=LINKS)
    d.polygon([c, v[30], v[330], v[270]], fill=RECHTS)
    # Dunkle Kanten zwischen den Flaechen
    breite = max(2, int(r / 22))
    for ecke in (v[150], v[30], v[270]):
        d.line([c, ecke], fill=BG, width=breite)


def icon(groesse: int, skala: float, name: str) -> None:
    s = groesse * SS
    img = Image.new("RGBA", (s, s), BG)
    d = ImageDraw.Draw(img)
    zeichne_wuerfel(d, s / 2, s / 2 + s * 0.02, s * skala / 2)
    img = img.resize((groesse, groesse), Image.LANCZOS)
    ZIEL.mkdir(parents=True, exist_ok=True)
    img.save(ZIEL / name)
    print(f"OK  {name} ({groesse}x{groesse})")


if __name__ == "__main__":
    icon(512, 0.80, "icon-512.png")
    icon(192, 0.80, "icon-192.png")
    icon(512, 0.58, "icon-512-maskable.png")  # Safe-Zone fuer maskierbare Icons
    icon(180, 0.76, "apple-touch-icon.png")
