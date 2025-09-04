# -*- coding: utf-8 -*-
"""
Generatore MP3 dalle descrizioni Markdown (offline, Windows/SAPI).

- Legge i .md in INPUT_DIR (o --input)
- Estrae le sezioni "Passato", "Presente", "Futuro"
- Sintetizza TTS (pyttsx3, motore SAPI) 1 file alla volta (evita blocchi)
- Converte WAV -> MP3 con ffmpeg (auto-detect, nessun PATH richiesto)
- Nomi output: <stem>__Passato.mp3, __Presente.mp3, __Futuro.mp3 (o __Generale.mp3)

Requisiti:
  pip install pyttsx3
  (consigliato) ffmpeg installato (winget: Gyan.FFmpeg.Essentials)

Esempi:
  python audio.py
  python audio.py --only 00_il_matto
  python audio.py --force --rate 170
  python audio.py --ffmpeg "C:\ffmpeg\bin\ffmpeg.exe"
"""

from __future__ import annotations
import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable

# ==================== CONFIG DI DEFAULT (modificabili anche da CLI) ====================
DEFAULT_INPUT_DIR = r"C:\Users\HP\Desktop\zodiel_it_new\backend\descrizioni"
DEFAULT_OUTPUT_DIR = r"C:\Users\HP\Desktop\zodiel_it_new\frontend\audio"
DEFAULT_RATE = 175                 # velocità parlato (pyttsx3)
DEFAULT_PREFER_FEMALE = True       # prova a preferire Elsa
DEFAULT_FFMPEG_PATH = ""           # lascia vuoto per auto-detect
DEFAULT_BITRATE = "192k"           # bitrate MP3
# =======================================================================================

try:
    import pyttsx3  # motore TTS offline Windows (SAPI)
except ImportError:
    print("Errore: manca 'pyttsx3'. Installa con:  pip install pyttsx3")
    sys.exit(1)


# --------------------------- UTILITÀ: LOG & NORMALIZZAZIONI ----------------------------
def log_ok(msg: str) -> None:
    print(f"[OK] {msg}")

def log_info(msg: str) -> None:
    print(f"ℹ️  {msg}")

def log_warn(msg: str) -> None:
    print(f"⚠️  {msg}")

def log_err(msg: str) -> None:
    print(f"❌ {msg}")

def normalize_text_for_tts(text: str) -> str:
    """Pulisce il Markdown per la voce TTS."""
    t = text.replace("\r\n", "\n")
    t = re.sub(r"^\s*---\s*$", "", t, flags=re.MULTILINE)           # orizzontali
    t = re.sub(r"^#{1,6}\s+.*$", "", t, flags=re.MULTILINE)         # heading
    t = re.sub(r"\*\*(.*?)\*\*", r"\1", t)                          # **bold**
    t = re.sub(r"\*(.*?)\*", r"\1", t)                              # *italic*
    t = re.sub(r"`(.*?)`", r"\1", t)                                # `code`
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    return t.strip()


def extract_sections(md_text: str) -> Dict[str, str]:
    """
    Estrae 'Passato', 'Presente', 'Futuro' da un file .md.
    Se non trova le sezioni, restituisce {"Generale": testo_pulito}.
    """
    text = md_text.replace("\r\n", "\n")
    parts = re.split(r"^##\s*Significato nel\s+", text, flags=re.MULTILINE)
    sections: Dict[str, str] = {}

    if len(parts) <= 1:
        body = normalize_text_for_tts(text)
        if body:
            sections["Generale"] = body
        return sections

    for chunk in parts[1:]:
        header_end = chunk.find("\n")
        heading = chunk.strip() if header_end == -1 else chunk[:header_end].strip()
        body = "" if header_end == -1 else chunk[header_end + 1 :]
        heading_clean = heading.split()[0].strip().capitalize()  # "Passato"/"Presente"/"Futuro"
        body_clean = normalize_text_for_tts(body)
        if body_clean:
            sections[heading_clean] = body_clean

    return sections


# --------------------------- RICERCA AUTOMATICA DI FFMPEG ------------------------------
def auto_find_ffmpeg(user_ffmpeg_path: str | None = None) -> str | None:
    """Trova ffmpeg.exe senza affidarsi al PATH."""
    # 1) Percorso esplicito passato dall'utente
    if user_ffmpeg_path and os.path.exists(user_ffmpeg_path):
        return user_ffmpeg_path

    # 2) Variabile d'ambiente
    env_path = os.environ.get("FFMPEG_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    # 3) PATH di sistema
    exe = shutil.which("ffmpeg")
    if exe and os.path.exists(exe):
        return exe

    # 4) Percorsi tipici su Windows (winget + installazioni classiche)
    candidates: list[str] = []

    # link di winget
    local = os.environ.get("LOCALAPPDATA", "")
    links = os.path.join(local, r"Microsoft\WinGet\Links\ffmpeg.exe")
    if links:
        candidates.append(links)

    # pacchetti winget
    pkgs_glob = os.path.join(local, r"Microsoft\WinGet\Packages\**\ffmpeg.exe")
    candidates.extend(glob.glob(pkgs_glob, recursive=True))

    # installazioni classiche
    candidates += [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe",
    ]

    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None


# --------------------------- SELEZIONE VOCE ITALIANA (SAPI) ----------------------------
def pick_italian_voice_id(prefer_female: bool = True) -> str | None:
    """
    Restituisce l'ID di una voce italiana disponibile.
    Prova a preferire 'Elsa' (femminile) se presente.
    """
    try:
        engine = pyttsx3.init()
        voices = engine.getProperty("voices") or []
        chosen = None
        female_candidate = None
        for v in voices:
            name = (getattr(v, "name", "") or "").lower()
            vid  = (getattr(v, "id", "") or "").lower()
            langs = []
            if hasattr(v, "languages") and v.languages:
                for lang in v.languages:
                    try:
                        if isinstance(lang, bytes):
                            lang = lang.decode("utf-8", errors="ignore")
                    except Exception:
                        pass
                    langs.append(str(lang).lower())
            is_it = ("ital" in name) or ("ital" in vid) or any(("it" in l or "ital" in l) for l in langs)
            if is_it:
                if prefer_female and "elsa" in name:
                    female_candidate = v.id
                if chosen is None:
                    chosen = v.id
        try:
            engine.stop()
        except Exception:
            pass
        return female_candidate or chosen
    except Exception:
        return None


# --------------------------- SINTESI: 1 FILE PER VOLTA (ROBUSTA) -----------------------
def synth_wav_once(text: str, wav_path: Path, voice_id: str | None, rate: int) -> None:
    """
    Crea un engine pyttsx3, sintetizza 1 WAV, poi chiude.
    Approccio più stabile su Windows (evita blocchi runAndWait prolungati).
    """
    engine = pyttsx3.init()
    try:
        if voice_id:
            engine.setProperty("voice", voice_id)
        engine.setProperty("rate", rate)
        wav_path.parent.mkdir(parents=True, exist_ok=True)
        engine.save_to_file(text, str(wav_path))
        engine.runAndWait()  # genera davvero il WAV (può impiegare un po' su testi lunghi)
    finally:
        try:
            engine.stop()
        except Exception:
            pass
        del engine  # cleanup COM


def wav_to_mp3_with_ffmpeg(wav_path: Path, mp3_path: Path, bitrate: str, ffmpeg_exe: str) -> None:
    mp3_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg_exe, "-y", "-i", str(wav_path), "-b:a", bitrate, str(mp3_path)]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)


# -------------------------------------- MAIN LOGICA ------------------------------------
def md_files_in(dirpath: Path, only_substr: str | None) -> Iterable[Path]:
    files = sorted(dirpath.glob("*.md"))
    if only_substr:
        files = [p for p in files if only_substr.lower() in p.stem.lower()]
    return files


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Genera MP3 dalle descrizioni Markdown.")
    ap.add_argument("--input",  default=DEFAULT_INPUT_DIR,  help="Cartella .md (descrizioni)")
    ap.add_argument("--output", default=DEFAULT_OUTPUT_DIR, help="Cartella output MP3")
    ap.add_argument("--rate",   type=int, default=DEFAULT_RATE, help="Velocità voce (pyttsx3)")
    ap.add_argument("--male",   action="store_true", help="Preferisci voce maschile (invece di femminile)")
    ap.add_argument("--ffmpeg", default=DEFAULT_FFMPEG_PATH, help="Percorso esplicito a ffmpeg.exe")
    ap.add_argument("--bitrate", default=DEFAULT_BITRATE, help="Bitrate MP3 (es. 192k)")
    ap.add_argument("--only",    default=None, help="Elabora solo file con questo substring nello stem")
    ap.add_argument("--force",   action="store_true", help="Rigenera MP3 anche se esistono")
    args = ap.parse_args(argv)

    in_dir  = Path(args.input)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not in_dir.exists():
        log_err(f"Cartella input non trovata: {in_dir}")
        return 2

    # Voce italiana
    voice_id = pick_italian_voice_id(prefer_female=not args.male)
    if voice_id:
        print(f"Voce selezionata: {voice_id}")
    else:
        log_warn("Nessuna voce italiana trovata: userò quella di default.")

    # ffmpeg
    ffm = auto_find_ffmpeg(args.ffmpeg)
    if ffm:
        print(f"Userò ffmpeg: {ffm}")
    else:
        log_warn("ffmpeg non trovato: creerò solo WAV (niente MP3). Consigliato installare 'Gyan.FFmpeg.Essentials' via winget.")

    files = list(md_files_in(in_dir, args.only))
    if not files:
        log_warn(f"Nessun file .md trovato in {in_dir} (filtro --only={args.only!r})")
        return 1

    total_mp3 = 0
    total_wav = 0

    for md_path in files:
        # Leggi testo con UTF-8, fallback cp1252
        try:
            content = md_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = md_path.read_text(encoding="cp1252")

        sections = extract_sections(content)
        if not sections:
            log_warn(f"[SKIP] Nessuna sezione riconosciuta in: {md_path.name}")
            continue

        base = md_path.stem  # es: 00_il_matto   o   00_il_matto_r
        for label, text in sections.items():
            label_out = label if label in ("Passato", "Presente", "Futuro") else "Generale"
            mp3_file = out_dir / f"{base}__{label_out}.mp3"
            wav_file = mp3_file.with_suffix(".tmp.wav")

            if mp3_file.exists() and not args.force:
                log_ok(f"Esiste già: {mp3_file.name}")
                continue

            print(f"[CREA] {mp3_file.name} ...")
            try:
                # 1) Sintesi su WAV (engine nuovo per ogni file)
                synth_wav_once(text, wav_file, voice_id, args.rate)
                total_wav += 1

                # 2) Conversione in MP3 (se ffmpeg disponibile)
                if ffm:
                    try:
                        wav_to_mp3_with_ffmpeg(wav_file, mp3_file, args.bitrate, ffm)
                        total_mp3 += 1
                        print("       ✓ creato")
                    finally:
                        # Pulisci il temporaneo
                        try:
                            wav_file.unlink(missing_ok=True)
                        except Exception:
                            pass
                else:
                    log_warn("ffmpeg assente: lasciato WAV temporaneo (non utilizzabile dalla webapp).")

            except KeyboardInterrupt:
                print("\n⛔ Interrotto dall'utente.")
                return 130
            except subprocess.CalledProcessError as e:
                log_err(f"Errore ffmpeg: {e}")
            except Exception as e:
                log_err(f"Errore sintesi: {e}")

    print(f"\nFATTO. MP3 creati: {total_mp3}  (WAV sintetizzati: {total_wav})")
    print(f"Cartella output: {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
