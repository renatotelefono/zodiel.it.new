"""
Generate per‑section MP3s (Past / Present / Future) from English tarot markdown files.

Input folder (markdown):  C:\\Users\\HP\\Desktop\\zodiel_it_new\\backend\\descrizioni_en
Output folder (mp3):      C:\\Users\\HP\\Desktop\\zodiel_it_new\\frontend\\audio_en

Each source file like `00_the_fool.md` will produce:
  00_the_fool_Past.mp3
  00_the_fool_Present.mp3
  00_the_fool_Future.mp3

Requirements (install once):
  pip install google-cloud-texttospeech

Auth: Either set GOOGLE_APPLICATION_CREDENTIALS to your JSON key path,
      or set CREDS_PATH below.

Notes:
- Handles headings such as "## Meaning in the Past", "## Past", etc. (case-insensitive)
- Strips markdown to plain text.
- Automatically chunks very long sections to stay under TTS limits and concatenates the MP3 audio.
- Safe to rerun; it will overwrite existing MP3s unless OVERWRITE=False.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple, List

from google.cloud import texttospeech  # type: ignore
from google.oauth2 import service_account  # type: ignore

# =====================
# --- CONFIGURE ME ---
# =====================
# If you prefer, leave CREDS_PATH empty and set the env var GOOGLE_APPLICATION_CREDENTIALS
CREDS_PATH = r"C:\\Users\\HP\\Desktop\\zodiel_it_new\\goggle-tts-467809-8c23f1a0b869.json"

INPUT_DIR = Path(r"C:\\Users\\HP\\Desktop\\zodiel_it_new\\backend\\descrizioni_en")
OUTPUT_DIR = Path(r"C:\\Users\\HP\\Desktop\\zodiel_it_new\\frontend\\audio_en")

# Voice parameters (tweak to taste)
LANGUAGE_CODE = "en-US"
VOICE_NAME = ""  # e.g. "en-US-Neural2-F"; leave empty for default voice for the language
SPEAKING_RATE = 1.0
PITCH = 0.0
AUDIO_ENCODING = texttospeech.AudioEncoding.MP3

# Behavior
OVERWRITE = True
MAX_CHARS_PER_CHUNK = 4200  # Stay well below Google TTS 5000 char limit for safety
VERBOSE = True

# ===============
# Markdown parser
# ===============
# Regex to capture sections. Accepts variations like:
#   ## Meaning in the Past / Present / Future
#   ## Past / Present / Future
#   ### Meaning - Past, etc.
SECTION_PATTERNS = {
    "Past": re.compile(
        r"(?ims)^\s*#{2,}\s*(?:meaning\s*(?:-|in\s+the\s+)?)?past\s*$\s*(.*?)\s*(?=^\s*#{2,}\s*|\Z)",
    ),
    "Present": re.compile(
        r"(?ims)^\s*#{2,}\s*(?:meaning\s*(?:-|in\s+the\s+)?)?present\s*$\s*(.*?)\s*(?=^\s*#{2,}\s*|\Z)",
    ),
    "Future": re.compile(
        r"(?ims)^\s*#{2,}\s*(?:meaning\s*(?:-|in\s+the\s+)?)?future\s*$\s*(.*?)\s*(?=^\s*#{2,}\s*|\Z)",
    ),
}

MD_STRIP_PATTERNS = [
    (re.compile(r"^\s*`{3}[\s\S]*?`{3}\s*", re.M), ""),  # code fences
    (re.compile(r"`([^`]*)`"), r"\1"),                     # inline code
    (re.compile(r"!\[[^\]]*\]\([^\)]*\)"), ""),        # images
    (re.compile(r"\[([^\]]+)\]\([^\)]*\)"), r"\1"),   # links -> text
    (re.compile(r"^>\s?", re.M), ""),                      # blockquotes
    (re.compile(r"\*\*|__|\*|_"), ""),                   # emphasis
    (re.compile(r"^\s*#{1,6}\s*" , re.M), ""),            # headings markers
    (re.compile(r"^\s*-{3,}\s*$", re.M), ""),             # hr lines
]


def md_to_text(md: str) -> str:
    text = md
    for pat, repl in MD_STRIP_PATTERNS:
        text = pat.sub(repl, text)
    # Normalize whitespace
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    return text


def extract_sections(md: str) -> Dict[str, str]:
    sections: Dict[str, str] = {}
    for name, pat in SECTION_PATTERNS.items():
        m = pat.search(md)
        if m:
            sections[name] = md_to_text(m.group(1))
    return sections


# ==================
# Google TTS helpers
# ==================

def get_tts_client() -> texttospeech.TextToSpeechClient:
    """Build a TTS client, preferring CREDS_PATH if it exists.
    Falls back to GOOGLE_APPLICATION_CREDENTIALS if valid,
    then to Application Default Credentials (ADC).
    Provides a clearer error if nothing works.
    """
    # 1) Prefer explicit CREDS_PATH
    if CREDS_PATH:
        p = Path(CREDS_PATH)
        if p.exists():
            creds = service_account.Credentials.from_service_account_file(str(p))
            return texttospeech.TextToSpeechClient(credentials=creds)

    # 2) Try env var if it points to a real file
    env_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if env_path and Path(env_path).exists():
        creds = service_account.Credentials.from_service_account_file(env_path)
        return texttospeech.TextToSpeechClient(credentials=creds)

    # 3) Last resort: ADC (gcloud auth, etc.)
    try:
        return texttospeech.TextToSpeechClient()
    except Exception as e:
        raise RuntimeError(
            "No valid Google Cloud credentials found. Set CREDS_PATH in the script "
            "or set the environment variable GOOGLE_APPLICATION_CREDENTIALS to a valid JSON key file."
        ) from e


def synthesize_chunks(client: texttospeech.TextToSpeechClient, text: str) -> bytes:
    """Split long text into chunks and concatenate MP3 bytes."""
    parts = chunk_text(text, MAX_CHARS_PER_CHUNK)

    voice = texttospeech.VoiceSelectionParams(
        language_code=LANGUAGE_CODE,
        name=(VOICE_NAME or None),
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=AUDIO_ENCODING,
        speaking_rate=SPEAKING_RATE,
        pitch=PITCH,
    )

    all_bytes = bytearray()
    for idx, part in enumerate(parts, 1):
        synthesis_input = texttospeech.SynthesisInput(text=part)
        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )
        all_bytes.extend(response.audio_content)
        if VERBOSE and len(parts) > 1:
            print(f"  - chunk {idx}/{len(parts)}: {len(response.audio_content)} bytes")
    return bytes(all_bytes)


def chunk_text(text: str, max_len: int) -> List[str]:
    t = text.strip()
    if len(t) <= max_len:
        return [t]
    # Prefer splitting on sentence boundaries. We do a simple heuristic.
    sentences = re.split(r"(?<=[.!?])\s+", t)
    chunks: List[str] = []
    cur = []
    cur_len = 0
    for s in sentences:
        if cur_len + len(s) + 1 <= max_len:
            cur.append(s)
            cur_len += len(s) + 1
        else:
            if cur:
                chunks.append(" ".join(cur).strip())
            # If the single sentence is longer than max_len, hard-wrap it
            if len(s) > max_len:
                for i in range(0, len(s), max_len):
                    chunks.append(s[i:i+max_len])
                cur = []
                cur_len = 0
            else:
                cur = [s]
                cur_len = len(s)
    if cur:
        chunks.append(" ".join(cur).strip())
    return chunks


# =============
# Main routine
# =============

def process_file(md_path: Path, out_dir: Path, client: texttospeech.TextToSpeechClient) -> None:
    if VERBOSE:
        print(f"Reading: {md_path}")
    md = md_path.read_text(encoding="utf-8")
    sections = extract_sections(md)
    if not sections:
        print(f"  ! No Past/Present/Future sections found in {md_path.name}")
        return

    base = md_path.stem  # e.g. 00_the_fool
    out_dir.mkdir(parents=True, exist_ok=True)

    for sec in ("Past", "Present", "Future"):
        if sec not in sections:
            print(f"  ! Missing section: {sec}")
            continue
        text = sections[sec]
        if not text.strip():
            print(f"  ! Empty text for section: {sec}")
            continue
        out_file = out_dir / f"{base}_{sec}.mp3"
        if out_file.exists() and not OVERWRITE:
            print(f"  - Skipping existing {out_file.name}")
            continue
        if VERBOSE:
            print(f"  > Synthesizing {out_file.name} ({len(text)} chars)")
        audio_bytes = synthesize_chunks(client, text)
        out_file.write_bytes(audio_bytes)
        if VERBOSE:
            print(f"  ✓ Wrote {out_file}")


def main(argv: Optional[List[str]] = None) -> int:
    in_dir = INPUT_DIR
    out_dir = OUTPUT_DIR

    if not in_dir.exists():
        print(f"ERROR: Input folder not found: {in_dir}")
        return 1

    client = get_tts_client()

    md_files = sorted(p for p in in_dir.glob("*.md") if p.is_file())
    if not md_files:
        print(f"No .md files found in {in_dir}")
        return 0

    for md_path in md_files:
        try:
            process_file(md_path, out_dir, client)
        except Exception as e:
            print(f"ERROR processing {md_path.name}: {e}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
