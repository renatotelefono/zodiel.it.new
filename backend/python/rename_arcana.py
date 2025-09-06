# prefix_arcana_en_r.py
from pathlib import Path
import shutil
import re
import unicodedata

# === CARTELLE SORGENTE/DESTINAZIONE ===
SRC_DIR = Path(r"C:\Users\HP\Desktop\zodiel_it_new\backend\descrizioni_en")
DST_DIR = Path(r"C:\Users\HP\Desktop\zodiel_it_new\backend\descrizioni_en1")

# Consideriamo solo markdown
VALID_EXTS = {".md", ".markdown"}

# Canonici EN (slug) per 0..21 (Rider–Waite: 8=Strength, 11=Justice)
EN_BY_NUM = {
    0:  "the_fool",
    1:  "the_magician",
    2:  "the_high_priestess",
    3:  "the_empress",
    4:  "the_emperor",
    5:  "the_hierophant",
    6:  "the_lovers",
    7:  "the_chariot",
    8:  "strength",
    9:  "the_hermit",
    10: "wheel_of_fortune",
    11: "justice",
    12: "the_hanged_man",
    13: "death",
    14: "temperance",
    15: "the_devil",
    16: "the_tower",
    17: "the_star",
    18: "the_moon",
    19: "the_sun",
    20: "judgement",
    21: "the_world",
}
NUM_BY_EN = {v: k for k, v in EN_BY_NUM.items()}

# Varianti comuni -> canonico
ALIASES = {
    # articoli opzionali
    "fool": "the_fool",
    "magician": "the_magician",
    "high_priestess": "the_high_priestess",
    "empress": "the_empress",
    "emperor": "the_emperor",
    "hierophant": "the_hierophant",
    "lovers": "the_lovers",
    "chariot": "the_chariot",
    "hermit": "the_hermit",
    "hanged_man": "the_hanged_man",
    "devil": "the_devil",
    "tower": "the_tower",
    "star": "the_star",
    "moon": "the_moon",
    "sun": "the_sun",
    "world": "the_world",

    # wheel con/senza "the"
    "the_wheel_of_fortune": "wheel_of_fortune",
    "wheel_of_fortune": "wheel_of_fortune",

    # judgement / judgment
    "judgment": "judgement",
    "the_judgment": "judgement",
    "the_judgement": "judgement",

    # normalizza eventuali "the_" superflui
    "the_strength": "strength",
    "the_justice": "justice",
}

def normalize_slug(s: str) -> str:
    """Minuscole, senza accenti, non-alfa numerici -> underscore singolo."""
    s = s.lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("’", "'")
    s = re.sub(r"[^\w]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s

def strip_numeric_prefix(s: str) -> str:
    """Rimuove un eventuale prefisso numerico 'NN_'."""
    m = re.match(r"^\d{1,2}[_\- ]+(.*)$", s)
    return m.group(1) if m else s

def split_suffix_r(s: str) -> tuple[str, bool]:
    """Rileva e rimuove un suffisso '_r' / '-r' / ' r' al termine dello slug."""
    if re.search(r"[_\-\s]r$", s):
        base = re.sub(r"[_\-\s]r$", "", s)
        return base, True
    return s, False

def to_canonical_name(name_stem: str) -> tuple[str | None, bool]:
    """
    Ritorna (slug_canonico, has_r_suffix) oppure (None, has_r_suffix) se non riconosciuto.
    """
    s = normalize_slug(name_stem)
    s = strip_numeric_prefix(s)      # tolgo eventuali numeri già presenti
    s, has_r = split_suffix_r(s)     # separo e conservo il suffisso _r

    # alias diretti
    if s in ALIASES:
        s = ALIASES[s]

    # match diretto
    if s in NUM_BY_EN:
        return s, has_r

    # prova a rimuovere "the_" iniziale
    if s.startswith("the_"):
        t = s[4:]
        if t in NUM_BY_EN:
            # alcune carte sono canoniche senza 'the' (es. strength, justice, wheel_of_fortune)
            # ma molte lo richiedono; se esiste la versione con 'the_' in NUM_BY_EN, la preferiamo
            if "the_" + t in NUM_BY_EN:
                return "the_" + t, has_r
            return t, has_r

    # prova ad aggiungere "the_" se mancante
    if not s.startswith("the_") and ("the_" + s) in NUM_BY_EN:
        return "the_" + s, has_r

    # ultimo tentativo con alias nuovamente (dopo manipolazioni)
    s2 = ALIASES.get(s)
    if s2 in NUM_BY_EN:
        return s2, has_r

    return None, has_r

def main():
    if not SRC_DIR.exists():
        raise SystemExit(f"Cartella sorgente non trovata: {SRC_DIR}")
    DST_DIR.mkdir(parents=True, exist_ok=True)

    processed = 0
    skipped = 0
    conflicts = 0

    for src in SRC_DIR.iterdir():
        if not src.is_file():
            continue
        ext = src.suffix.lower()
        if ext not in VALID_EXTS:
            continue

        stem = src.stem  # es. "the_fool" o "the_fool_r"
        canon, has_r = to_canonical_name(stem)
        if canon is None:
            print(f"[SKIP] Nome non riconosciuto: {src.name}")
            skipped += 1
            continue

        num = NUM_BY_EN.get(canon)
        if num is None or not (0 <= num <= 21):
            print(f"[SKIP] Numero non trovato per: {src.name}")
            skipped += 1
            continue

        new_stem = f"{num:02d}_{canon}" + ("_r" if has_r else "")python 
        dst = DST_DIR / f"{new_stem}{ext}"

        if dst.exists():
            # Evita sovrascritture aggiungendo suffisso __n
            i = 1
            while True:
                cand = DST_DIR / f"{new_stem}__{i}{ext}"
                if not cand.exists():
                    dst = cand
                    conflicts += 1
                    break
                i += 1

        shutil.copy2(src, dst)
        print(f"[OK] {src.name} -> {dst.name}")
        processed += 1

    print("\n== RIEPILOGO ==")
    print(f"Creati:     {processed}")
    print(f"Saltati:    {skipped}")
    print(f"Conflitti (suffisso __n): {conflicts}")

if __name__ == "__main__":
    main()
