"""Draws the app icons (PNG) from the same geometry as icon.svg, without extra libraries.

    python3 tools/icons.py        -> icons/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
"""
import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")

# icon.svg, 32x32 units: black rounded square, white chart line, yellow dot.
LINE = [(8, 21), (13, 15), (17, 18), (24, 9)]
LINE_W = 2.6
DOT = (24, 9, 2.4)
WHITE, YELLOW, BLACK = (255, 255, 255), (255, 240, 168), (0, 0, 0)


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def rrect_dist(px, py, size, r):
    # signed distance to a rounded square [0,size]^2
    c = size / 2
    qx, qy = abs(px - c) - (c - r), abs(py - c) - (c - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def png(path, size, pixels):
    raw = b"".join(b"\x00" + bytes(row) for row in pixels)
    chunk = lambda tag, data: struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


def draw(size, full_bleed, content_scale):
    unit = size / 32 * content_scale          # pixels per svg unit
    off = (size - 32 * unit) / 2               # centre the 32x32 drawing
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            # background
            if full_bleed:
                cov_bg = 1.0
            else:
                cov_bg = max(0.0, min(1.0, 0.5 - rrect_dist(px, py, size, 9 / 32 * size)))
            col = [0.0, 0.0, 0.0]
            # svg coordinates of this pixel
            sx, sy = (px - off) / unit, (py - off) / unit
            d_line = min(seg_dist(sx, sy, *LINE[i], *LINE[i + 1]) for i in range(len(LINE) - 1)) - LINE_W / 2
            cov_line = max(0.0, min(1.0, 0.5 - d_line * unit))
            d_dot = math.hypot(sx - DOT[0], sy - DOT[1]) - DOT[2]
            cov_dot = max(0.0, min(1.0, 0.5 - d_dot * unit))
            for i in range(3):
                c = BLACK[i]
                c = c + (WHITE[i] - c) * cov_line
                c = c + (YELLOW[i] - c) * cov_dot
                col[i] = c
            a = cov_bg
            row += [int(round(col[0])), int(round(col[1])), int(round(col[2])), int(round(a * 255))]
        rows.append(row)
    return rows


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, size, bleed, scale in [
        ("icon-192.png", 192, False, 1.0),
        ("icon-512.png", 512, False, 1.0),
        ("maskable-512.png", 512, True, 0.72),      # content inside the 80% safe zone
        ("apple-touch-icon.png", 180, True, 0.86),   # iOS rounds the corners itself
    ]:
        png(os.path.join(OUT, name), size, draw(size, bleed, scale))
        print(name)
