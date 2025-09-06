# prefix_arcana_en.py
from pathlib import Path
import shutil
import re
import unicodedata

# === CARTELLE SORGENTE/DESTINAZIONE ===
SRC_DIR = Path(r"C:\Users\HP\Desktop\zodiel_it_new\backend\descrizioni_en")
DST_DIR = Path(r"C:\Users\HP\Desktop\zodiel_it_new\backend\descrizioni_en1")

# Consideriamo solo markdown
VALID_EXTS = {".md", ".markdown"}

def normalize_slug(s: str) -> str:
    """Minuscole, senza accenti, non-alfa numerici -> underscore singolo."""
    s = s.lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("’", "'")
    s = re.sub(r"[^\w]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s

# Canonici EN (slug) per 0..21
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

# Mappa inversa numero per nome canonico
NUM_BY_EN = {v: k for k, v in EN_BY_NUM.items()}

# Varianti -> canonico
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

    # wheel con/without "the"
    "the_wheel_of_fortune": "wheel_of_fortune",
    "wheel_of_fortune": "wheel_of_fortune",

    # judgement/ judgment
    "judgment": "judgement",
    "the_judgment": "judgement",
    "the_judgement": "judgement",

    # strength/justice rimangono come sono
    "the_strength": "strength",
    "the_justice": "justice",
}

def to_canonical(slug: str) -> str | None:
    """Restituisce lo slug canonico EN_BY_NUM, se riconosciuto."""
    s = normalize_slug(slug)
    # Rimuovi eventuale prefisso numerico già presente (es. "08_strength")
    m = re.match(r"^(\d{1,2})[_\- ]+(.*)$", s)
    if m:
        s = m.group(2)

    # Alias diretti
    if s in NUM_BY_EN:
        return s
    if s in ALIASES:
        return ALIASES[s]

    # Togli 'the_' iniziale e riprova
    if s.startswith("the_"):
        t = s[4:]
        if t in NUM_BY_EN:
            return NUM_BY_EN.keys().__iter__().__self__  # not used; fallback below
        if t in ALIASES:
            return ALIASES[t]
        # Se senza the_ combacia con una carta che normalmente ha the_
        prefixed = f"the_{t}"
        if prefixed in NUM_BY_EN:
            return prefixed

    # Heuristiche leggere: alcuni file potrebbero usare trattini
    s2 = s.replace("-", "_")
    if s2 in NUM_BY_EN:
        return s2
    if s2 in ALIASES:
        return ALIASES[s2]

    return None

def number_for_canonical(canon: str) -> int | None:
    """Numero 0..21 per lo slug canonico."""
    if canon in NUM_BY_EN:
        return NUM_BY_EN[canon]
    # Dopo gli alias, canon dovrebbe essere in NUM_BY_EN; in caso contrario None
    return NUM_BY_EN.get(canon)

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

        stem = src.stem  # es. "the_fool" o "the-fool"
        canon = to_canonical(stem)

        # Se non riconosciuto, prova comunque a prendere eventuale numero già presente + nome
        if canon is None:
            # Prova pattern "NN_nome"
            m = re.match(r"^(\d{1,2})[_\- ]+(.*)$", normalize_slug(stem))
            if m:
                try:
                    n = int(m.group(1))
                    name_part = m.group(2)
                    # se name_part è mappabile ad un canonico, usa quello; altrimenti mantieni lo slug
                    c2 = to_canonical(name_part) or name_part
                    canon = c2
                    num = n
                except ValueError:
                    num = None
            else:
                num = None
        else:
            num = number_for_canonical(canon)

        if canon is None or num is None or not (0 <= num <= 21):
            print(f"[SKIP] Nome non riconosciuto: {src.name}")
            skipped += 1
            continue

        new_name = f"{num:02d}_{canon}{ext}"
        dst = DST_DIR / new_name

        if dst.exists():
            # Evita sovrascritture
            i = 1
            while True:
                cand = DST_DIR / f"{num:02d}_{canon}__{i}{ext}"
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
