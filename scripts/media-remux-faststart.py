#!/usr/bin/env python3
"""Remux non-faststart MP4s in Review Room uploads to faststart (moov first).

Non-destructive: originals are moved to a backup dir before the remuxed file
takes their place. Verifies each remux with ffprobe before swapping.
Usage: python3 remux_faststart.py [--dry-run]
"""
import argparse, os, shutil, struct, subprocess, sys, time

UP = "/root/review-room-project/data/uploads"
BAK = "/root/review-room-project/data/uploads_backup_slowstart"

ap = argparse.ArgumentParser()
ap.add_argument("--dry-run", action="store_true")
args = ap.parse_args()

def atom_order(path):
    out = []
    with open(path, "rb") as f:
        off = 0
        total = os.path.getsize(path)
        for _ in range(6):
            f.seek(off)
            h = f.read(8)
            if len(h) < 8:
                break
            sz, typ = struct.unpack(">I4s", h)
            typ = typ.decode("latin1", "replace")
            if sz == 1:
                sz = struct.unpack(">Q", f.read(8))[0]
            elif sz == 0:
                sz = total - off
            out.append(typ)
            if sz <= 0:
                break
            off += sz
            if off >= total:
                break
    return out

def needs_faststart(path):
    a = atom_order(path)
    if "moov" not in a or "mdat" not in a:
        return True
    return a.index("moov") > a.index("mdat")

def probe(path):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                            "format=duration", "-of", "csv=p=0", path],
                           capture_output=True, text=True, timeout=60)
        return float(r.stdout.strip() or 0)
    except Exception:
        return 0.0

files = [os.path.join(UP, f) for f in sorted(os.listdir(UP)) if f.lower().endswith(".mp4")]
targets = [f for f in files if needs_faststart(f)]
print(f"mp4 total: {len(files)} | need faststart: {len(targets)}")
for t in targets[:10]:
    print(f"   {os.path.getsize(t)/1048576:7.1f} MB {os.path.basename(t)}")

if args.dry_run or not targets:
    sys.exit(0)

os.makedirs(BAK, exist_ok=True)
done = 0
failed = []
for src in targets:
    name = os.path.basename(src)
    tmp = src + ".faststart.tmp.mp4"
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src,
                        "-c", "copy", "-movflags", "+faststart", tmp],
                       check=True, timeout=1800, capture_output=True)
        d_in, d_out = probe(src), probe(tmp)
        if not os.path.isfile(tmp) or os.path.getsize(tmp) < 1000:
            raise RuntimeError("empty output")
        if d_in and d_out and abs(d_in - d_out) > 1.0:
            raise RuntimeError(f"duration mismatch {d_in} -> {d_out}")
        if needs_faststart(tmp):
            raise RuntimeError("still not faststart")
        shutil.move(src, os.path.join(BAK, name))
        os.replace(tmp, src)
        os.chown(src, 1000, 1000)
        done += 1
        print(f"OK  {name}  {d_out:.1f}s")
    except Exception as e:
        failed.append((name, str(e)))
        if os.path.isfile(tmp):
            os.remove(tmp)
        print(f"FAIL {name}: {e}")

print(f"\nremuxed: {done} | failed: {len(failed)} | backups in {BAK}")
for f in failed[:10]:
    print("  ", f)
