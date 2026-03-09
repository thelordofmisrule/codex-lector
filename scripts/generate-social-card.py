#!/usr/bin/env python3

from pathlib import Path
import struct
import zlib

WIDTH = 1200
HEIGHT = 630


FONT = {
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
}


def clamp(value):
    return max(0, min(255, int(value)))


def blend(a, b, t):
    return tuple(clamp(a[i] + (b[i] - a[i]) * t) for i in range(3))


def set_px(buf, x, y, color):
    if 0 <= x < WIDTH and 0 <= y < HEIGHT:
        idx = (y * WIDTH + x) * 3
        buf[idx:idx + 3] = bytes(color)


def fill_rect(buf, x, y, w, h, color):
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(WIDTH, x + w)
    y1 = min(HEIGHT, y + h)
    if x0 >= x1 or y0 >= y1:
        return
    row = bytes(color) * (x1 - x0)
    for yy in range(y0, y1):
        idx = (yy * WIDTH + x0) * 3
        buf[idx:idx + len(row)] = row


def fill_rounded_rect(buf, x, y, w, h, r, color):
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            inside = True
            if xx < x + r and yy < y + r:
                inside = (xx - (x + r)) ** 2 + (yy - (y + r)) ** 2 <= r * r
            elif xx >= x + w - r and yy < y + r:
                inside = (xx - (x + w - r - 1)) ** 2 + (yy - (y + r)) ** 2 <= r * r
            elif xx < x + r and yy >= y + h - r:
                inside = (xx - (x + r)) ** 2 + (yy - (y + h - r - 1)) ** 2 <= r * r
            elif xx >= x + w - r and yy >= y + h - r:
                inside = (xx - (x + w - r - 1)) ** 2 + (yy - (y + h - r - 1)) ** 2 <= r * r
            if inside:
                set_px(buf, xx, yy, color)


def stroke_rounded_rect(buf, x, y, w, h, r, thickness, color):
    fill_rounded_rect(buf, x, y, w, h, r, color)
    fill_rounded_rect(buf, x + thickness, y + thickness, w - thickness * 2, h - thickness * 2, max(0, r - thickness), (255, 248, 240))


def draw_glyph(buf, x, y, glyph, scale, color):
    rows = FONT.get(glyph, FONT[" "])
    for row_idx, row in enumerate(rows):
        for col_idx, bit in enumerate(row):
            if bit == "1":
                fill_rect(buf, x + col_idx * scale, y + row_idx * scale, scale, scale, color)


def draw_text(buf, x, y, text, scale, color, tracking=1):
    cursor = x
    for ch in text:
        draw_glyph(buf, cursor, y, ch, scale, color)
        cursor += 5 * scale + tracking * scale


def make_png(rgb, width, height):
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    row_size = width * 3
    for y in range(height):
        raw.append(0)
        start = y * row_size
        raw.extend(rgb[start:start + row_size])

    return b"".join([
        b"\x89PNG\r\n\x1a\n",
        chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)),
        chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
        chunk(b"IEND", b""),
    ])


def main():
    out_path = Path(__file__).resolve().parents[1] / "client" / "public" / "social-card.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    bg_top = (244, 237, 221)
    bg_bottom = (230, 217, 183)
    panel_fill = (255, 248, 240)
    panel_border = (197, 178, 138)
    accent = (122, 30, 46)
    gold = (138, 110, 50)
    body = (78, 67, 58)

    rgb = bytearray(WIDTH * HEIGHT * 3)
    for y in range(HEIGHT):
        color = blend(bg_top, bg_bottom, y / (HEIGHT - 1))
        row = bytes(color) * WIDTH
        idx = y * WIDTH * 3
        rgb[idx:idx + len(row)] = row

    fill_rounded_rect(rgb, 46, 46, 1108, 538, 26, panel_fill)
    stroke_rounded_rect(rgb, 46, 46, 1108, 538, 26, 2, panel_border)
    fill_rounded_rect(rgb, 86, 88, 12, 454, 6, accent)
    fill_rect(rgb, 108, 90, 930, 2, panel_border)
    fill_rect(rgb, 108, 540, 930, 2, panel_border)
    fill_rect(rgb, 130, 470, 860, 18, (242, 233, 213))

    draw_text(rgb, 130, 132, "CODEX LECTOR", 4, gold, tracking=2)
    draw_text(rgb, 130, 205, "ANNOTATED", 10, accent, tracking=1)
    draw_text(rgb, 130, 315, "SHAKESPEARE", 10, accent, tracking=1)
    draw_text(rgb, 130, 405, "READ DISCUSS EXPLORE", 5, body, tracking=2)
    draw_text(rgb, 130, 515, "LINE BY LINE NOTES AND DISCUSSION", 4, body, tracking=1)
    draw_text(rgb, 785, 540, "CODEXLECTOR.COM", 4, gold, tracking=1)

    out_path.write_bytes(make_png(rgb, WIDTH, HEIGHT))


if __name__ == "__main__":
    main()
