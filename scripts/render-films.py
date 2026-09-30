"""Render the FormBridge demo films from verified UI captures and narration.

Requires Pillow and ffmpeg (or imageio-ffmpeg); narration is generated separately.
No evaluation results or customer data appear in these films.
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "docs" / "media"
CAPTURES = MEDIA / "captures"
SCENES = json.loads((MEDIA / "film-scenes.json").read_text())
AUDIO = Path(os.environ.get("FORMBRIDGE_FILM_AUDIO_DIR", "/tmp/formbridge-film-audio"))
BUILD = Path(os.environ.get("FORMBRIDGE_FILM_BUILD_DIR", "/tmp/formbridge-film-build"))
BUILD.mkdir(parents=True, exist_ok=True)

try:
    import imageio_ffmpeg

    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = shutil.which("ffmpeg")
if not FFMPEG:
    raise SystemExit("Install ffmpeg or imageio-ffmpeg to render the films")

FONT = "/System/Library/Fonts/Avenir Next.ttc"
FONT_MONO = "/System/Library/Fonts/Menlo.ttc"
W, H = 1280, 720
BG = (15, 39, 44)
CREAM = (244, 250, 247)
MINT = (137, 222, 195)
MUTED = (162, 187, 182)


def font(size: int, *, mono: bool = False, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_MONO if mono else FONT, size,
                              index=0 if mono or bold else 7)


def fit_lines(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and draw.textlength(candidate, font=face) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def text_block(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, *,
               face: ImageFont.FreeTypeFont, width: int, fill: tuple[int, int, int],
               leading: int) -> int:
    x, y = xy
    for line in fit_lines(draw, text, face, width):
        draw.text((x, y), line, font=face, fill=fill)
        y += leading
    return y


def background() -> Image.Image:
    image = Image.new("RGB", (W, H), BG)
    pixels = image.load()
    for y in range(H):
        for x in range(W):
            glow = max(0.0, 1.0 - math.hypot((x - 1040) / 980, (y - 90) / 730))
            pixels[x, y] = (
                int(15 + glow * 8),
                int(39 + glow * 21),
                int(44 + glow * 16),
            )
    draw = ImageDraw.Draw(image)
    for radius in (170, 260, 350, 440):
        draw.ellipse((1020 - radius, 350 - radius, 1020 + radius, 350 + radius), outline=(35, 77, 75), width=1)
    draw.line((66, 653, 1214, 653), fill=(49, 88, 84), width=1)
    return image


def mark(draw: ImageDraw.ImageDraw, x: int, y: int, scale: int = 1) -> None:
    draw.rounded_rectangle((x, y, x + 38 * scale, y + 38 * scale), radius=10 * scale,
                           outline=MINT, width=max(2, 2 * scale))
    for dx, top, bottom in ((10, 12, 23), (18, 9, 26), (26, 13, 23)):
        draw.rounded_rectangle((x + dx * scale, y + top * scale, x + (dx + 3) * scale,
                                y + bottom * scale), radius=2 * scale, fill=MINT)


def base_chrome(draw: ImageDraw.ImageDraw, film: str, index: int, count: int) -> None:
    mark(draw, 66, 47)
    draw.text((116, 50), "FormBridge", font=font(23, bold=True), fill=CREAM)
    draw.text((66, 674), "A REVIEWABLE BOOKING BRIEF", font=font(12, mono=True), fill=MUTED)
    draw.text((1050, 674), f"{film.upper()}  /  {index + 1:02d} OF {count:02d}",
              font=font(12, mono=True), fill=MUTED)


def render_still(film: str, index: int, count: int, scene: dict) -> Path:
    image = background()
    draw = ImageDraw.Draw(image)
    base_chrome(draw, film, index, count)
    if scene["kind"] in ("title", "end"):
        draw.rounded_rectangle((66, 177, 188, 211), radius=17, fill=(31, 86, 79))
        draw.text((82, 185), scene["eyebrow"].split("  /")[0],
                  font=font(11, mono=True), fill=MINT)
        y = text_block(draw, (66, 246), scene["headline"], face=font(62, bold=True),
                       width=1080, fill=CREAM, leading=77)
        text_block(draw, (70, min(550, y + 23)), scene["subhead"], face=font(22),
                   width=1000, fill=MUTED, leading=29)
        draw.rounded_rectangle((66, 604, 206, 610), radius=3, fill=MINT)
    else:
        draw.text((66, 155), scene["eyebrow"], font=font(14, mono=True), fill=MINT)
        y = text_block(draw, (66, 220), scene["headline"], face=font(46, bold=True),
                       width=355, fill=CREAM, leading=57)
        text_block(draw, (68, min(500, y + 27)), scene["subhead"], face=font(21),
                   width=347, fill=MUTED, leading=31)
        draw.rounded_rectangle((66, 591, 178, 597), radius=3, fill=MINT)
        draw.text((66, 615), "LIVE APP · SYNTHETIC CASE", font=font(11, mono=True), fill=MUTED)

        source = Image.open(CAPTURES / scene["image"]).convert("RGB")
        source = source.crop((236, 0, 1280, 720)).resize((764, 527), Image.Resampling.LANCZOS)
        card = Image.new("RGB", (788, 557), (245, 249, 247))
        card_draw = ImageDraw.Draw(card)
        card_draw.rectangle((0, 0, 788, 30), fill=(231, 241, 236))
        for pos, color in ((16, (190, 218, 204)), (32, (169, 209, 189)), (48, (140, 195, 172))):
            card_draw.ellipse((pos, 11, pos + 8, 19), fill=color)
        card.paste(source, (12, 30))
        shadow = Image.new("RGBA", (820, 588), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.rounded_rectangle((16, 14, 804, 572), radius=15, fill=(0, 0, 0, 85))
        shadow = shadow.filter(ImageFilter.GaussianBlur(15))
        image.paste(shadow, (445, 74), shadow)
        image.paste(card, (461, 88))

    path = BUILD / f"{film}-{index:02d}.png"
    image.save(path, optimize=True)
    return path


def duration(audio: Path) -> float:
    result = subprocess.run([FFMPEG, "-hide_banner", "-i", str(audio)],
                            capture_output=True, text=True)
    match = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", result.stderr)
    if not match:
        raise RuntimeError(f"Could not read duration of {audio}")
    h, m, s = match.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def render_clip(still: Path, audio: Path, output: Path) -> float:
    seconds = max(5.0, duration(audio) + 1.0)
    command = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-loop", "1",
               "-framerate", "30", "-i", str(still), "-i", str(audio),
               "-filter_complex", "[0:v]zoompan=z='min(zoom+0.00010,1.025)':d=1:s=1280x720:fps=30,format=yuv420p[v];[1:a]apad=pad_dur=1[a]",
               "-map", "[v]", "-map", "[a]", "-t", f"{seconds:.2f}",
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-r", "30",
               "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(output)]
    subprocess.run(command, check=True)
    return seconds


def render_film(film: str, sequence: list[dict]) -> None:
    segments: list[Path] = []
    total = 0.0
    for index, scene in enumerate(sequence):
        still = render_still(film, index, len(sequence), scene)
        voice = AUDIO / f"{film}-{index:02d}.mp3"
        if not voice.is_file():
            raise FileNotFoundError(f"Missing narration: {voice}")
        clip = BUILD / f"{film}-{index:02d}.mp4"
        total += render_clip(still, voice, clip)
        segments.append(clip)
        print(f"{film}: rendered scene {index + 1}/{len(sequence)}", flush=True)
    manifest = BUILD / f"{film}-concat.txt"
    manifest.write_text("".join(f"file '{clip}'\n" for clip in segments))
    output = MEDIA / f"FormBridge-{film}.mp4"
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat",
                    "-safe", "0", "-i", str(manifest), "-c", "copy", "-movflags", "+faststart",
                    str(output)], check=True)
    print(f"Wrote {output} ({total:.1f}s)", flush=True)


for name, scenes in SCENES.items():
    render_film(name, scenes)


def render_banner() -> None:
    banner = Image.new("RGB", (1600, 560), BG)
    draw = ImageDraw.Draw(banner)
    for x in range(1600):
        shade = x / 1600
        draw.line((x, 0, x, 559), fill=(int(15 + 9 * shade), int(39 + 22 * shade), int(44 + 16 * shade)))
    for radius in (220, 330, 440):
        draw.ellipse((1320 - radius, 240 - radius, 1320 + radius, 240 + radius),
                     outline=(42, 87, 80), width=2)
    mark(draw, 78, 67, 2)
    draw.text((172, 79), "FormBridge", font=font(46, bold=True), fill=CREAM)
    draw.text((78, 207), "A BOOKING BRIEF THAT", font=font(20, mono=True), fill=MINT)
    draw.text((78, 251), "keeps up with", font=font(62, bold=True), fill=CREAM)
    draw.text((78, 326), "the conversation.", font=font(62, bold=True), fill=CREAM)
    draw.text((80, 438), "Corrections tracked. Uncertainty visible. Every detail linked.",
              font=font(23), fill=MUTED)
    source = Image.open(CAPTURES / "new-03-correction.png").convert("RGB")
    source = source.crop((785, 0, 1280, 720)).resize((348, 506), Image.Resampling.LANCZOS)
    frame = Image.new("RGB", (372, 532), (232, 243, 238))
    frame_draw = ImageDraw.Draw(frame)
    frame_draw.rectangle((0, 0, 372, 26), fill=(209, 229, 218))
    for dot_x in (14, 29, 44):
        frame_draw.ellipse((dot_x, 9, dot_x + 7, 16), fill=(132, 184, 160))
    frame.paste(source, (12, 26))
    banner.paste(frame, (1180, 14))
    banner.save(MEDIA / "FormBridge-banner.png", optimize=True)


def render_poster(film: str, index: int) -> None:
    still = Image.open(BUILD / f"{film}-{index:02d}.png").convert("RGB")
    draw = ImageDraw.Draw(still, "RGBA")
    draw.ellipse((591, 311, 689, 409), fill=(10, 39, 39, 220), outline=(169, 243, 213, 250), width=3)
    draw.polygon(((628, 333), (628, 387), (668, 360)), fill=(231, 251, 239, 255))
    still.resize((960, 540), Image.Resampling.LANCZOS).save(MEDIA / f"FormBridge-{film}-poster.png", optimize=True)


render_banner()
render_poster("launch", 2)
render_poster("walkthrough", 6)
