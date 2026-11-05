# pitch/assemble.py — builds final_sovir_pitch.mp4 from clips + VO + titles.
# Video per segment = VO duration + 0.8s pad. Clips are trimmed, cards looped.
# Optional: drop a music.mp3 in pitch/ and it gets ducked under the VO.
# Run: pitch/.venv/Scripts/python pitch/assemble.py
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(ROOT, "clips")
TITLES = os.path.join(ROOT, "titles")
VO = os.path.join(ROOT, "vo")
WORK = os.path.join(ROOT, "work")
OUT = os.path.join(ROOT, "final_sovir_pitch.mp4")
os.makedirs(WORK, exist_ok=True)

import imageio_ffmpeg
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# segment -> [candidate video sources, first that exists wins] or title card
PLAN = [
    ("s1a", [], "t0_intro"),                       # intro card, no VO
    ("s1", ["s1_real_pages"], None),
    ("s2", ["s2_signin_panel"], None),
    ("s4", ["s4_phish_ext", "s4_opera_pages"], None),      # no desktop capture (Devin leak)
    ("s4b", ["s4_opera_pages"], None),                     # extra live pages, no VO
    ("s3", ["s3b_incidents_fresh", "s3_incidents"], None),  # alerts AFTER attack
    ("s5", ["s5_incident_detail"], None),
    ("s6", ["s6_permissions"], None),
    ("s6b", ["s6b_tabs_tour"], None),              # devices/audit tour, no VO
    ("s7", ["s7_composite", "s7_opera_popup", "s7_popup"], None),
    ("s7b", ["s7b_mobile_en", "s7_android_real"], None),   # English console on phone
    ("s8", [], "t8_outro"),                        # outro card under vo_s8
    ("tail", [], "t8_outro"),                      # hold brand card to reach ~3:00
]
PAD = 0.8
CARD_DUR = 4.5
NOVO_DUR = 9.0

def run(cmd):
    print("+", " ".join(cmd[:6]), "...")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-1500:]); sys.exit(1)
    return r

def duration(path):
    r = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))

def vo_dur(name):
    p = os.path.join(VO, f"vo_{name}.mp3")
    return duration(p) if os.path.exists(p) else 0

# s7 composite: real extension popup overlaid top-right over the Facebook
# page — the "popup from the toolbar" framing the user wants.
pop_src = os.path.join(CLIPS, "s7_opera_popup.webm")
fb_src = os.path.join(CLIPS, "s7_fb_base.webm")
if os.path.exists(pop_src) and os.path.exists(fb_src):
    comp = os.path.join(CLIPS, "s7_composite.mp4")
    run([FFMPEG, "-y", "-i", fb_src, "-i", pop_src,
         "-filter_complex",
         "[1:v]crop=400:380:0:0,scale=560:-1,format=yuva420p,"
         "colorchannelmixer=aa=0.98[pop];"
         "[0:v][pop]overlay=W-w-96:140",
         "-c:v", "libx264", "-preset", "fast", "-an", comp])

def find_clip(cands):
    for name in cands:
        for ext in ("webm", "mp4"):
            p = os.path.join(CLIPS, f"{name}.{ext}")
            if os.path.exists(p):
                return p
    return None

parts, audio_in, offset = [], [], 0.0
for i, (seg, cands, card) in enumerate(PLAN):
    dur = (vo_dur(seg) + PAD) if vo_dur(seg) else (CARD_DUR if card else NOVO_DUR)
    out = os.path.join(WORK, f"part{i:02d}.mp4")
    src = find_clip(cands)
    if src:
        run([FFMPEG, "-y", "-i", src, "-t", f"{dur:.2f}",
             "-vf", "scale=2560:1440:force_original_aspect_ratio=decrease,"
                    "pad=2560:1440:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p",
             "-an", "-c:v", "libx264", "-preset", "fast", out])
    else:
        img = os.path.join(TITLES, f"{card}.png") if card else None
        if not img or not os.path.exists(img):
            img = os.path.join(TITLES, "t0_intro.png")
        run([FFMPEG, "-y", "-loop", "1", "-i", img, "-t", f"{dur:.2f}",
             "-vf", "fps=30,format=yuv420p", "-an",
             "-c:v", "libx264", "-preset", "fast", out])
    parts.append(out)
    vop = os.path.join(VO, f"vo_{seg}.mp3")
    if os.path.exists(vop):
        audio_in.append((vop, offset))
    offset += dur

# concat video parts
with open(os.path.join(WORK, "list.txt"), "w") as f:
    for p in parts:
        f.write(f"file '{p.replace(os.sep, '/')}'\n")
base = os.path.join(WORK, "base.mp4")
run([FFMPEG, "-y", "-f", "concat", "-safe", "0",
     "-i", os.path.join(WORK, "list.txt"), "-c", "copy", base])

# mix VO at offsets (+ optional music bed)
music = os.path.join(ROOT, "music.mp3")
inputs, filter_parts, mix_labels = [base], [], []
for n, (ap, off) in enumerate(audio_in):
    inputs.append(ap)
    filter_parts.append(f"[{n+1}:a]adelay={int(off*1000)}|{int(off*1000)}[d{n}]")
    mix_labels.append(f"[d{n}]")
if os.path.exists(music):
    inputs.append(music)
    filter_parts.append(f"[{len(inputs)-1}:a]volume=0.14[mus]")
    mix_labels.append("[mus]")
filter_parts.append("".join(mix_labels) +
    f"amix=inputs={len(mix_labels)}:duration=longest:normalize=0[aout]")
run([FFMPEG, "-y", *sum([["-i", x] for x in inputs], []),
     "-filter_complex", ";".join(filter_parts),
     "-map", "0:v", "-map", "[aout]", "-c:v", "copy",
     "-c:a", "aac", "-b:a", "160k", "-shortest", OUT])
print("DONE ->", OUT)

# subtitles (soft srt, aligned to segment offsets)
segs = json.load(open(os.path.join(VO, "segments.json"), encoding="utf-8"))
def fmt(t):
    h, m = int(t // 3600), int(t % 3600 // 60)
    s, ms = int(t % 60), int((t % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
t, srt, idx = 0.0, [], 1
for seg in [p[0] for p in PLAN]:
    d = vo_dur(seg) + (PAD if vo_dur(seg) else 0)
    if seg in segs:
        words = segs[seg].split(". ")
        chunk = max(1, len(words) // 3)
        cues = [". ".join(words[i:i+chunk]) for i in range(0, len(words), chunk)]
        for j, c in enumerate(cues):
            t0 = t + d * j / len(cues); t1 = t + d * (j+1) / len(cues)
            srt.append(f"{idx}\n{fmt(t0)} --> {fmt(t1)}\n{c.strip()}\n")
            idx += 1
    t += d if d else NOVO_DUR
open(os.path.join(ROOT, "subtitles.srt"), "w", encoding="utf-8").write("\n".join(srt))
print("subtitles -> subtitles.srt")
