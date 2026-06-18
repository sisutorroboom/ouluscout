# OuluScout – Sijaintianalyysi

Karttapohjainen liiketoiminnan sijaintianalyysityökalu Oulun alueelle.
Yrittäjä valitsee kartalta pisteen ja saa automaattisen raportin sijainnin
liiketoimintapotentiaalista.

## Ominaisuudet

- **Isokroonit** – kävely ja ajo 5/10/15 min (OpenRouteService)
- **Kilpailevat kahvilat** – OSM Overpass API
- **Väestö, ikä, tulot, työpaikat** – Tilastokeskuksen WFS (vaestoruutu + Paavo)
- **Ajoneuvoliikenne** – Digitraffic LAM-asemat
- **Joukkoliikenne** – Digitransit Waltti GraphQL
- **Jalankulkijat** – Oulunliikenne.fi GraphQL (bonus)
- **Sijaintipisteytys 0–100** – säädettävillä painotuksilla
- Enintään 3 sijaintia rinnakkain

## Tekninen pino

| Osa | Teknologia |
|-----|-----------|
| Frontend | React 18 + TypeScript + MapLibre GL JS + Tailwind CSS |
| Backend | Python FastAPI + asyncio |
| Geokäsittely | Shapely + pyproj (EPSG:3067 ↔ WGS84) |
| Karttapohja | OSM-rasteritiilet (ei API-avainta) |

## Asennus ja käynnistys

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Luo .env tiedosto (katso .env.example)
cp .env.example .env
# Lisää ORS_API_KEY .env-tiedostoon

uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # Kehityspalvelin osoitteessa http://localhost:5173
```

Frontend proksioi `/api`-pyynnöt automaattisesti backendille (portti 8000).

## API-avaimet

Tarvitaan:
- **OpenRouteService** (isokroonit) – ilmainen avain osoitteesta https://openrouteservice.org
  Aseta `ORS_API_KEY` tiedostoon `backend/.env`

Ei vaadita:
- OSM / Overpass API – julkinen, ilmainen
- Tilastokeskus WFS – julkinen, ilmainen
- Digitraffic – julkinen, ilmainen
- Digitransit – julkinen, ilmainen
- Nominatim geokoodaus – julkinen, ilmainen

## Lähteet

- © OpenStreetMap-tekijät (CC BY-SA)
- Tilastokeskus / Statistics Finland (CC BY 4.0)
- Väylä / Fintraffic (CC BY 4.0)
- Digitransit / HSL
- OpenRouteService
