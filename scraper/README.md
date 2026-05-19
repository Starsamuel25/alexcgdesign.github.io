# Scraper de dentistas dominicanos

Pequeño wrapper de [Scrapling](https://github.com/D4Vinci/Scrapling) que
recolecta clínicas dentales del Cibao (Moca, Santiago, La Vega, Espaillat,
Hermanas Mirabal, Duarte, Monseñor Nouel, Sánchez Ramírez, Valverde,
Puerto Plata, María Trinidad Sánchez) y las mergea contra
`../crm/dentists.json`.

## Instalación

```bash
cd scraper
pip install -r requirements.txt
scrapling install      # baja el browser para los modos stealth/dynamic
```

## Uso

```bash
# Corre todas las fuentes contra el Cibao
python scrape_dentistas.py

# Solo Páginas Amarillas
python scrape_dentistas.py --fuente paginas-amarillas

# Limita a Espaillat (donde vives)
python scrape_dentistas.py --provincia Espaillat --provincia Santiago

# Salida: ../crm/dentists_scraped.json (mergeado con el seed)
```

## Por qué los directorios .do bloquean

Casi todos los directorios dominicanos (PáginasAmarillas, Doctoralia,
Infoguía) están detrás de Cloudflare. El script usa `StealthyFetcher`
de Scrapling — genera huellas de browser realistas y suele pasar. Si
aun así te bloquean:

1. Prueba un proxy residencial (env vars `HTTP_PROXY`, `HTTPS_PROXY`).
2. Cambia a `DynamicFetcher` (Playwright real) editando `fetch()`.
3. Espacia los requests subiendo el `time.sleep`.

## Estructura del JSON

```json
{
  "generated": "YYYY-MM-DD",
  "total": 100,
  "dentistas": [
    {
      "id": 1,
      "nombre": "...",
      "telefono": "809-XXX-XXXX",
      "telefono_alt": "",
      "direccion": "...",
      "ciudad": "...",
      "provincia": "...",
      "especialidad": "...",
      "fuente": "..."
    }
  ]
}
```

## Aviso legal

Los datos son públicos (directorios médicos). Úsalos para tu CRM
personal de contacto en frío. No los revendas. Respeta los `robots.txt`
y la frecuencia de requests.
