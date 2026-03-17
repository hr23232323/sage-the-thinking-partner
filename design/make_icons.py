#!/usr/bin/env python3
"""
Generate sage.icns — supersampled 4× for crisp anti-aliased edges.
"""

import os
import math
import subprocess
from PIL import Image, ImageDraw, ImageFilter

# ── Palette ──────────────────────────────────────────────────────────────────
BG_TOP = (250, 249, 247)   # #faf9f7  warm cream
BG_BOT = (225, 218, 208)   # #e1dad0  warm parchment
C_TL   = (170, 114,  82)   # #aa7252  highlight facet
C_TR   = (139,  94,  60)   # #8b5e3c  main accent
C_BR   = ( 90,  56,  34)   # #5a3822  deep shadow
C_BL   = (122,  78,  46)   # #7a4e2e  mid shadow

SSAA = 4   # supersampling factor — draw at 4×, downsample for smooth edges

SIZES = [
    (16,   1, "icon_16x16.png"),
    (16,   2, "icon_16x16@2x.png"),
    (32,   1, "icon_32x32.png"),
    (32,   2, "icon_32x32@2x.png"),
    (128,  1, "icon_128x128.png"),
    (128,  2, "icon_128x128@2x.png"),
    (256,  1, "icon_256x256.png"),
    (256,  2, "icon_256x256@2x.png"),
    (512,  1, "icon_512x512.png"),
    (512,  2, "icon_512x512@2x.png"),
]


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(ca, cb, t):
    return tuple(int(lerp(ca[i], cb[i], t)) for i in range(3))


def diagonal_gradient(size, angle_deg=148):
    """
    Create a diagonal gradient image at the given angle.
    Efficient: draws one scanline per row using the projection of each
    row's midpoint onto the gradient axis to pick the colour.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    rad = math.radians(angle_deg)
    dx = math.cos(rad)
    dy = math.sin(rad)

    # Project all four corners to find the gradient's min/max extent
    corners = [(0, 0), (size, 0), (0, size), (size, size)]
    projs = [x * dx + y * dy for x, y in corners]
    pmin, pmax = min(projs), max(projs)

    # For each row, project its y-midpoint; for each col project x-midpoint.
    # We do it column-by-column (fastest for a diagonal).
    for x in range(size):
        for y in range(size):
            proj = x * dx + y * dy
            t = (proj - pmin) / (pmax - pmin)
            t = max(0.0, min(1.0, t))
            col = lerp_color(BG_TOP, BG_BOT, t) + (255,)
            draw.point((x, y), fill=col)

    return img


def fast_diagonal_gradient(size, angle_deg=148):
    """
    Faster: build gradient per-column by computing the dominant axis
    and drawing vertical or horizontal strips.
    """
    # For 148°, the gradient direction is mostly vertical (y-dominated).
    # We combine x and y contributions per-pixel via scanlines.
    rad = math.radians(angle_deg)
    dx = math.cos(rad)
    dy = math.sin(rad)

    corners = [(0, 0), (size, 0), (0, size), (size, size)]
    projs = [x * dx + y * dy for x, y in corners]
    pmin, pmax = min(projs), max(projs)

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw horizontal scanlines — each row gets the colour for its y-midpoint
    # projected onto the gradient axis. Columns affect the colour slightly.
    # We approximate by pre-computing the t-value at the left edge and right
    # edge of each row and linearly interpolating across.
    for y in range(size):
        t_left  = ((0      * dx + y * dy) - pmin) / (pmax - pmin)
        t_right = ((size   * dx + y * dy) - pmin) / (pmax - pmin)
        t_left  = max(0.0, min(1.0, t_left))
        t_right = max(0.0, min(1.0, t_right))

        # If the gradient has negligible horizontal component, just one line
        if abs(t_right - t_left) < 0.002:
            col = lerp_color(BG_TOP, BG_BOT, t_left) + (255,)
            draw.line([(0, y), (size - 1, y)], fill=col)
        else:
            # Draw column segments within this row
            for x in range(size):
                t = lerp(t_left, t_right, x / (size - 1))
                col = lerp_color(BG_TOP, BG_BOT, t) + (255,)
                draw.point((x, y), fill=col)

    return img


def make_icon(px: int) -> Image.Image:
    s = px * SSAA  # draw size (supersampled)

    # ── Background ────────────────────────────────────────────────────────────
    # Fast vertical gradient (most of the 148° look; x-component is subtle)
    grad = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(s):
        # mix in a small x contribution for the diagonal feel
        ty = y / (s - 1)
        col = lerp_color(BG_TOP, BG_BOT, ty) + (255,)
        gd.line([(0, y), (s - 1, y)], fill=col)

    # Radial highlight (upper-left warmth, matching the HTML version)
    highlight = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    cx_h = int(s * 0.30)
    cy_h = int(s * 0.22)
    for step in range(20):
        frac  = step / 20
        alpha = int(45 * (1 - frac) ** 2)
        r_h   = int(s * 0.48 * frac) + 1
        hd.ellipse(
            [cx_h - r_h, cy_h - r_h, cx_h + r_h, cy_h + r_h],
            fill=(255, 252, 248, alpha),
        )

    bg = Image.alpha_composite(grad, highlight)

    # Rounded-square mask (macOS squircle ≈ 22.37% radius)
    r_sq = int(s * 0.2237)
    mask = Image.new("L", (s, s), 0)
    md   = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, s - 1, s - 1], radius=r_sq, fill=255)

    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(bg, mask=mask)

    draw = ImageDraw.Draw(img)

    # ── Diamond mark ─────────────────────────────────────────────────────────
    # Match HTML SVG proportions: viewBox 0 0 100 100, mark at 3..97 (94%)
    # Icon mark occupies 62% of icon width (124/200 from the HTML)
    margin = s * 0.19
    cx = s / 2.0
    cy = s / 2.0

    top    = (cx,          margin)
    right  = (s - margin,  cy)
    bottom = (cx,          s - margin)
    left   = (margin,      cy)
    center = (cx,          cy)

    draw.polygon([top, left,         center], fill=C_TL)
    draw.polygon([top, right,        center], fill=C_TR)
    draw.polygon([right, bottom,     center], fill=C_BR)
    draw.polygon([bottom, left,      center], fill=C_BL)

    # Facet divider lines — only at larger draw sizes
    if s >= 128:
        lw = max(1, int(s * 0.0055))
        draw.line([top, bottom], fill=(250, 249, 247, 68), width=lw)
        draw.line([left, right], fill=(250, 249, 247, 68), width=lw)

    # Outer edge for crispness
    if s >= 256:
        lw = max(1, int(s * 0.004))
        draw.polygon([top, right, bottom, left],
                     outline=(35, 16, 6, 30), width=lw)

    # ── Downsample to target size (Lanczos = best quality) ───────────────────
    out = img.resize((px, px), Image.LANCZOS)
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    iconset = os.path.join(here, "sage.iconset")
    os.makedirs(iconset, exist_ok=True)

    for logical, scale, filename in SIZES:
        px   = logical * scale
        icon = make_icon(px)
        path = os.path.join(iconset, filename)
        icon.save(path, "PNG")
        print(f"  {filename:32s}  {px}×{px}")

    icns = os.path.join(here, "sage.icns")
    r = subprocess.run(
        ["iconutil", "-c", "icns", iconset, "-o", icns],
        capture_output=True, text=True,
    )
    if r.returncode == 0:
        print(f"\n  sage.icns → {icns}")
    else:
        print(f"\n  iconutil error:\n{r.stderr}")


if __name__ == "__main__":
    main()
