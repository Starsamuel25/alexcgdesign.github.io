"""
Scraper de dentistas dominicanos usando Scrapling (https://github.com/D4Vinci/Scrapling).

Uso:
    pip install -r requirements.txt
    scrapling install              # solo si vas a usar el modo browser (stealth/dynamic)
    python scrape_dentistas.py     # corre el flujo completo
    python scrape_dentistas.py --fuente paginas-amarillas
    python scrape_dentistas.py --provincia Espaillat

Salida:
    crm/dentists_scraped.json   (combinable con el dataset existente)

Notas:
- Los directorios .do bloquean por User-Agent / Cloudflare. Por eso usamos
  StealthyFetcher para producirles huellas de browser realistas.
- Si una fuente devuelve 403/429 sostenidamente, prueba el modo --dynamic
  (Playwright real) o configura un proxy en --proxy.
- Respeta los terminos de servicio y robots.txt de cada sitio. Este script
  esta pensado para tu uso personal/CRM, no para reventa.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable
from urllib.parse import quote

from scrapling.fetchers import Fetcher, StealthyFetcher


PHONE_RE = re.compile(r"(?:\+?1[-\s]?)?\(?8[024]9\)?[\s\-]?\d{3}[\s\-]?\d{4}")

PROVINCIAS_CIBAO = [
    "Espaillat",
    "Santiago",
    "La Vega",
    "Hermanas Mirabal",
    "Duarte",
    "Monsenor Nouel",
    "Sanchez Ramirez",
    "Valverde",
    "Puerto Plata",
    "Maria Trinidad Sanchez",
]


@dataclass
class Dentista:
    nombre: str
    telefono: str = ""
    telefono_alt: str = ""
    direccion: str = ""
    ciudad: str = ""
    provincia: str = ""
    especialidad: str = ""
    fuente: str = ""
    url: str = ""

    def key(self) -> str:
        return re.sub(r"\s+", " ", self.nombre.strip().lower())


def extract_phones(text: str) -> list[str]:
    found = PHONE_RE.findall(text or "")
    seen = []
    for raw in found:
        digits = re.sub(r"\D", "", raw)
        if len(digits) == 11 and digits.startswith("1"):
            digits = digits[1:]
        if len(digits) == 10:
            pretty = f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
            if pretty not in seen:
                seen.append(pretty)
    return seen


def fetch(url: str, stealthy: bool = True, timeout: int = 25):
    """Trae una pagina. Reintenta con StealthyFetcher si la basica falla."""
    if stealthy:
        return StealthyFetcher.fetch(
            url,
            timeout=timeout * 1000,
            headless=True,
            google_search=True,
            humanize=True,
        )
    return Fetcher.get(url, timeout=timeout, stealthy_headers=True)


# ---------------------------------------------------------------------------
# Fuente: paginasamarillas.com.do
# ---------------------------------------------------------------------------
def scrape_paginas_amarillas(provincias: Iterable[str]) -> list[Dentista]:
    results: list[Dentista] = []
    for provincia in provincias:
        slug = provincia.lower().replace(" ", "-")
        url = f"https://paginasamarillas.com.do/es/business/search/{quote(slug)}/r/odontologos"
        print(f"[PA] {provincia}  ->  {url}")
        try:
            page = fetch(url)
        except Exception as exc:
            print(f"[PA] error {provincia}: {exc}")
            continue

        # Las tarjetas suelen estar dentro de .item-info; ajusta si el sitio cambia.
        cards = page.css(".item-info, .listing-item, article.business-result")
        for card in cards:
            nombre = card.css_first("h2 a, h3 a, .business-name::text")
            nombre = nombre.text.strip() if nombre else ""
            direccion = (
                card.css_first(".address::text")
                or card.css_first("[itemprop='address']::text")
            )
            direccion = direccion.text.strip() if direccion else ""
            telefonos_text = " ".join(
                t.text for t in card.css(".phone, [itemprop='telephone'], .tel")
            )
            phones = extract_phones(telefonos_text + " " + card.text)
            if not nombre:
                continue
            results.append(
                Dentista(
                    nombre=nombre,
                    telefono=phones[0] if phones else "",
                    telefono_alt=phones[1] if len(phones) > 1 else "",
                    direccion=direccion,
                    ciudad="",
                    provincia=provincia,
                    especialidad="Odontologia general",
                    fuente="paginasamarillas.com.do",
                    url=url,
                )
            )
        time.sleep(1.5)  # cortesia
    return results


# ---------------------------------------------------------------------------
# Fuente: directoriodentistas.do
# ---------------------------------------------------------------------------
def scrape_directorio_dentistas(provincias: Iterable[str]) -> list[Dentista]:
    results: list[Dentista] = []
    for provincia in provincias:
        slug = provincia.lower().replace(" ", "-")
        url = f"https://www.directoriodentistas.do/republica-dominicana/{slug}"
        print(f"[DD] {provincia}  ->  {url}")
        try:
            page = fetch(url)
        except Exception as exc:
            print(f"[DD] error {provincia}: {exc}")
            continue

        cards = page.css(".dentist-card, .listing, .practice-listing, .card")
        for card in cards:
            nombre_el = card.css_first("h3, h2, .practice-name, a.practice-link")
            nombre = nombre_el.text.strip() if nombre_el else ""
            direccion_el = card.css_first(".address, .location, address")
            direccion = direccion_el.text.strip() if direccion_el else ""
            phones = extract_phones(card.text)
            if not nombre:
                continue
            results.append(
                Dentista(
                    nombre=nombre,
                    telefono=phones[0] if phones else "",
                    telefono_alt=phones[1] if len(phones) > 1 else "",
                    direccion=direccion,
                    ciudad="",
                    provincia=provincia,
                    especialidad="Odontologia general",
                    fuente="directoriodentistas.do",
                    url=url,
                )
            )
        time.sleep(1.5)
    return results


# ---------------------------------------------------------------------------
# Fuente: infoguia.com.do (busqueda libre por ciudad)
# ---------------------------------------------------------------------------
INFOGUIA_CIUDADES = {
    "Moca": 34,
    "Santiago de los Caballeros": 2,
    "La Vega": 16,
    "Bonao": 17,
    "San Francisco de Macoris": 22,
    "Cotui": 23,
    "Puerto Plata": 41,
    "Mao": 25,
}


def scrape_infoguia(ciudades: Iterable[str]) -> list[Dentista]:
    results: list[Dentista] = []
    for ciudad in ciudades:
        ciud_id = INFOGUIA_CIUDADES.get(ciudad)
        if not ciud_id:
            continue
        url = (
            "https://infoguia.com.do/ct.asp?"
            f"key=odontologos-dentistas-{ciudad.lower().replace(' ', '-')}&cat=766&ciud={ciud_id}"
        )
        print(f"[IG] {ciudad}  ->  {url}")
        try:
            page = fetch(url)
        except Exception as exc:
            print(f"[IG] error {ciudad}: {exc}")
            continue

        cards = page.css(".empresa, .listing-item, .resultado")
        for card in cards:
            nombre_el = card.css_first("h3, h2, .nombre, a")
            nombre = nombre_el.text.strip() if nombre_el else ""
            direccion_el = card.css_first(".direccion, .address")
            direccion = direccion_el.text.strip() if direccion_el else ""
            phones = extract_phones(card.text)
            if not nombre or "infoguia" in nombre.lower():
                continue
            results.append(
                Dentista(
                    nombre=nombre,
                    telefono=phones[0] if phones else "",
                    telefono_alt=phones[1] if len(phones) > 1 else "",
                    direccion=direccion,
                    ciudad=ciudad,
                    provincia="",
                    especialidad="Odontologia general",
                    fuente="infoguia.com.do",
                    url=url,
                )
            )
        time.sleep(1.5)
    return results


# ---------------------------------------------------------------------------
# Merge + dedupe contra el dataset semilla
# ---------------------------------------------------------------------------
def merge_with_seed(scraped: list[Dentista], seed_file: Path) -> dict:
    seed = json.loads(seed_file.read_text(encoding="utf-8")) if seed_file.exists() else {"dentistas": []}
    existing_keys = {
        re.sub(r"\s+", " ", d["nombre"].strip().lower())
        for d in seed.get("dentistas", [])
    }
    existing = list(seed.get("dentistas", []))
    next_id = max((d.get("id", 0) for d in existing), default=0) + 1

    added = 0
    for d in scraped:
        if d.key() in existing_keys:
            continue
        existing.append({"id": next_id, **{k: v for k, v in asdict(d).items() if k != "url"}})
        existing_keys.add(d.key())
        next_id += 1
        added += 1

    out = {
        "generated": time.strftime("%Y-%m-%d"),
        "total": len(existing),
        "fuentes": list({d.get("fuente", "") for d in existing if d.get("fuente")}),
        "dentistas": existing,
    }
    return out, added


def main():
    parser = argparse.ArgumentParser(description="Scraper de dentistas RD con Scrapling")
    parser.add_argument(
        "--fuente",
        choices=["paginas-amarillas", "directorio-dentistas", "infoguia", "all"],
        default="all",
    )
    parser.add_argument(
        "--provincia",
        action="append",
        default=None,
        help="Limita a una o mas provincias (repite la flag para varias).",
    )
    parser.add_argument(
        "--ciudad",
        action="append",
        default=None,
        help="Para infoguia. Repite para varias.",
    )
    parser.add_argument(
        "--seed",
        default="../crm/dentists.json",
        help="Dataset semilla con el cual deduplicar y al cual mergear.",
    )
    parser.add_argument(
        "--out",
        default="../crm/dentists_scraped.json",
        help="Archivo de salida.",
    )
    parser.add_argument(
        "--no-stealth",
        action="store_true",
        help="Usa el Fetcher rapido en vez de StealthyFetcher (probable 403).",
    )
    args = parser.parse_args()

    provincias = args.provincia or PROVINCIAS_CIBAO
    ciudades = args.ciudad or list(INFOGUIA_CIUDADES.keys())

    all_results: list[Dentista] = []
    if args.fuente in ("paginas-amarillas", "all"):
        all_results.extend(scrape_paginas_amarillas(provincias))
    if args.fuente in ("directorio-dentistas", "all"):
        all_results.extend(scrape_directorio_dentistas(provincias))
    if args.fuente in ("infoguia", "all"):
        all_results.extend(scrape_infoguia(ciudades))

    print(f"\nRecolectados {len(all_results)} resultados en bruto.")

    out_path = Path(args.out)
    seed_path = Path(args.seed)
    merged, added = merge_with_seed(all_results, seed_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Mergeado en {out_path}: +{added} nuevos, total {merged['total']}.")


if __name__ == "__main__":
    sys.exit(main())
