#!/usr/bin/env python3
"""Monta i video finali a partire dalle clip generate con l'IA.

Uso:
  python3 studio/assemble.py prompts            # stampa i prompt da incollare nel generatore
  python3 studio/assemble.py build [id ...]     # monta i video (tutti, o solo gli id indicati)

Struttura attesa:
  studio/specs/<id>.json          specifica del video (clip, testi, caption)
  studio/clips/<id>/01.mp4 ...    clip scaricate dal generatore, numerate nell'ordine della specifica
  studio/output/<id>.mp4          video finale 1080x1920 pronto da caricare
  studio/output/<id>.md           titoli e caption per ogni piattaforma

Richiede solo Python 3 e ffmpeg/ffprobe.
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SPECS = ROOT / "specs"
CLIPS = ROOT / "clips"
OUTPUT = ROOT / "output"

W, H, FPS = 1080, 1920, 30
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def load_specs(ids):
    specs = [json.loads(p.read_text(encoding="utf-8")) for p in SPECS.glob("*.json")]
    specs.sort(key=lambda s: (s.get("publishDate", ""), s["id"]))
    if ids:
        specs = [s for s in specs if s["id"] in ids]
        missing = set(ids) - {s["id"] for s in specs}
        if missing:
            sys.exit(f"Specifiche non trovate: {', '.join(sorted(missing))}")
    return specs


def find_font():
    for f in FONT_CANDIDATES:
        if Path(f).exists():
            return f
    sys.exit("Nessun font trovato: aggiungi il percorso di un .ttf in FONT_CANDIDATES")


def has_audio(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return bool(out.strip())


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(out.strip())


def ff_path(p):
    # drawtext textfile paths: escape characters that are special in filtergraphs
    return str(p).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def drawtext(font, textfile, size, y, start=None, end=None, box=False):
    parts = [
        f"drawtext=fontfile='{ff_path(font)}'",
        f"textfile='{ff_path(textfile)}'",
        f"fontsize={size}",
        "fontcolor=white",
        "x=40" if box else "x=(w-text_w)/2",
        f"y={y}",
    ]
    if box:
        parts += ["box=1", "boxcolor=black@0.45", "boxborderw=12"]
    else:
        parts += ["borderw=5", "bordercolor=black@0.85"]
    if start is not None:
        parts.append(f"enable='between(t,{start},{end})'")
    return ":".join(parts)


# average glyph width of a bold sans font, as a fraction of the font size
CHAR_WIDTH = 0.64
MAX_TEXT_WIDTH = W - 100


def overlay_filters(font, overlay, tmp, n):
    """One drawtext per line so every line is centred; shrinks the font so the longest line fits."""
    lines = overlay["text"].split("\n")
    size = min(overlay.get("size", 66), int(MAX_TEXT_WIDTH / (CHAR_WIDTH * max(len(l) for l in lines))))
    top = overlay.get("y", "h*0.17")
    out = []
    for k, line in enumerate(lines):
        tf = tmp / f"t{n}_{k}.txt"
        tf.write_text(line, encoding="utf-8")
        out.append(drawtext(font, tf, size, f"{top}+{k * int(size * 1.3)}", overlay["start"], overlay["end"]))
    return out


def build(spec, font):
    vid = spec["id"]
    clip_dir = CLIPS / vid
    clips = [clip_dir / c["file"] for c in spec["clips"]]
    missing = [c for c in clips if not c.exists()]
    if missing:
        print(f"✗ {vid}: mancano {', '.join(c.name for c in missing)} in {clip_dir}")
        return False

    OUTPUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        inputs, chains, labels = [], [], []
        for i, (clip, c) in enumerate(zip(clips, spec["clips"])):
            trim = c.get("trim")  # [start, end] in seconds, optional
            if trim:
                inputs += ["-ss", str(trim[0]), "-to", str(trim[1])]
            inputs += ["-i", str(clip)]
            chains.append(
                f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},setsar=1,format=yuv420p[v{i}]"
            )
            if has_audio(clip):
                chains.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo[a{i}]")
            else:
                print(f"  ! {vid}/{clip.name} non ha audio: inserisco silenzio")
                seconds = trim[1] - trim[0] if trim else duration(clip)
                chains.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{seconds}[a{i}]")
            labels.append(f"[v{i}][a{i}]")
        chains.append(f"{''.join(labels)}concat=n={len(clips)}:v=1:a=1[vc][ac]")

        texts = []
        for j, o in enumerate(spec.get("overlays", [])):
            texts += overlay_filters(font, o, tmp, j)
        label = spec.get("aiLabel", "Generato con IA · AI-generated")
        lf = tmp / "label.txt"
        lf.write_text(label, encoding="utf-8")
        texts.append(drawtext(font, lf, 30, "h*0.075", box=True))
        chains.append(f"[vc]{','.join(texts)}[vo]")
        chains.append("[ac]loudnorm=I=-14:TP=-1.5:LRA=11[ao]")

        out = OUTPUT / f"{vid}.mp4"
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
               "-filter_complex", ";".join(chains), "-map", "[vo]", "-map", "[ao]",
               "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(out)]
        subprocess.run(cmd, check=True)

    write_captions(spec)
    print(f"✓ {vid}: {out.relative_to(ROOT.parent)}")
    return True


def write_captions(spec):
    c = spec["captions"]
    lines = [f"# {spec['title']}", "", f"Uscita: {spec.get('publishDate', '—')}", ""]
    for key, label in [
        ("youtubeTitle", "YouTube Shorts – titolo"),
        ("youtubeDescription", "YouTube Shorts – descrizione"),
        ("instagram", "Instagram / Facebook Reels"),
        ("tiktok", "TikTok"),
        ("pinnedComment", "Commento fissato"),
    ]:
        if c.get(key):
            lines += [f"## {label}", "", "```", c[key], "```", ""]
    lines += [
        "## Etichette IA da attivare",
        "- TikTok: interruttore \"Contenuto generato dall'IA\"",
        "- YouTube: \"Contenuti alterati o sintetici\" → Sì",
        "- Instagram/Facebook: etichetta \"Info IA\" (\"AI info\")",
    ]
    (OUTPUT / f"{spec['id']}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def print_prompts(specs):
    for s in specs:
        print(f"\n=== {s['id']} – {s['title']} (uscita {s.get('publishDate', '—')}) ===")
        print(f"Salva le clip in: studio/clips/{s['id']}/")
        for c in s["clips"]:
            print(f"\n--- {c['file']} ({c.get('seconds', 8)} s, 9:16) ---\n{c['prompt']}")


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in {"prompts", "build"}:
        sys.exit(__doc__)
    specs = load_specs(sys.argv[2:])
    if sys.argv[1] == "prompts":
        print_prompts(specs)
        return
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg non trovato: installalo (https://ffmpeg.org/download.html)")
    font = find_font()
    ok = [build(s, font) for s in specs]
    if not all(ok):
        sys.exit(1)


if __name__ == "__main__":
    main()
