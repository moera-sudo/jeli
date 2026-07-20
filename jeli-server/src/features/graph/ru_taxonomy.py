# Справочник ру → (племя, жуз) — см. docs/matching-algorhitm.md §4. Best-effort набор основных
# казахских родов по трём жузам, без претензии на исчерпывающую полноту (это отдельная долгая
# работа, не хакатон-масштаба) — покрывает наиболее часто встречающиеся ру.
from rapidfuzz import fuzz, process

RU_TAXONOMY_FUZZY_THRESHOLD = 0.75

# * Ключи — нормализованные (lower+strip) названия ру.
RU_TAXONOMY: dict[str, tuple[str, str]] = {
    # Ұлы жүз (старший жуз)
    "botpay": ("dulat", "ulyzhuz"),
    "sikym": ("dulat", "ulyzhuz"),
    "zhanys": ("dulat", "ulyzhuz"),
    "shymyr": ("dulat", "ulyzhuz"),
    "suan": ("suan", "ulyzhuz"),
    "shaprashty": ("shaprashty", "ulyzhuz"),
    "zhalayir": ("zhalayir", "ulyzhuz"),
    "alban": ("alban", "ulyzhuz"),
    "qangly": ("qangly", "ulyzhuz"),
    "oshaqty": ("oshaqty", "ulyzhuz"),
    "sary-uisin": ("uisin", "ulyzhuz"),
    "uisin": ("uisin", "ulyzhuz"),
    # Орта жүз (средний жуз)
    "karakesek": ("argyn", "ortazhuz"),
    "suyindik": ("argyn", "ortazhuz"),
    "atygai": ("argyn", "ortazhuz"),
    "karauyl": ("argyn", "ortazhuz"),
    "bagys": ("argyn", "ortazhuz"),
    "baganaly": ("naiman", "ortazhuz"),
    "sadyr": ("naiman", "ortazhuz"),
    "terstamgaly": ("naiman", "ortazhuz"),
    "kokzharlyk": ("naiman", "ortazhuz"),
    "kerei": ("kerei", "ortazhuz"),
    "kongyrat": ("kongyrat", "ortazhuz"),
    "qongyrat": ("kongyrat", "ortazhuz"),
    "kypshak": ("kypshak", "ortazhuz"),
    "waq": ("waq", "ortazhuz"),
    # Кіші жүз (младший жуз)
    "alimuly": ("alimuly", "kishizhuz"),
    "bayuly": ("bayuly", "kishizhuz"),
    "zhetiru": ("zhetiru", "kishizhuz"),
    "shekty": ("alimuly", "kishizhuz"),
    "adai": ("bayuly", "kishizhuz"),
    "tabyn": ("alimuly", "kishizhuz"),
}


def derive_tribe_zhuz(ru: str | None) -> tuple[str, str] | None:
    # * Точное совпадение, затем fuzzy-подбор через уже установленный rapidfuzz (доку §4: порог > 0.75).
    if not ru:
        return None
    normalized = ru.strip().lower()
    if not normalized:
        return None
    if normalized in RU_TAXONOMY:
        return RU_TAXONOMY[normalized]
    match = process.extractOne(normalized, RU_TAXONOMY.keys(), scorer=fuzz.ratio)
    if match is None:
        return None
    _, score, _ = match
    if score / 100.0 <= RU_TAXONOMY_FUZZY_THRESHOLD:
        return None
    return RU_TAXONOMY[match[0]]
