# Käpp · ICD0018

Käpp on mobiilirakendus Tallinna koeraomanikele: koerapargid kaardil, kes on praegu pargis, külastuste planeerimine, koera profiil ja privaatne terviseinfo, sõbrad, sõnumid ning groomerite ja kliinikute broneeringud.

TalTechi kursuse **ICD0018 Hübriidmobiilirakendused** projekt · autor Kristofer Metusala

- Disain: [Figma — Käpp Design System & Screens](https://www.figma.com/design/V2HKxpEsay19chlBD4AUV4)
- Tehnoloogiad: React Native (Expo SDK 57) · Node.js (Fastify 5) · PostgreSQL 17 + PostGIS · TypeScript läbivalt

## Dokumentatsioon

| | |
|---|---|
| [01 Uuring](docs/01-uuring.md) | Raamistike ja teekide võrdlus, versioonid, mis on praktikas kontrollitud, riskid |
| [02 Arhitektuur](docs/02-arhitektuur.md) | Süsteemi osad ja põhimõtted |
| [03 Andmemudel](docs/03-andmemudel.md) | Tabelid ja seos Figma vaadetega |
| [04 Arendusplaan](docs/04-arendusplaan.md) | Etapid M0–M8, töövõtted |
| [05 Disainisüsteem](docs/05-disainisusteem.md) | Figma tokenid koodis, Apple HIG reeglid |
| [06 Koodistandard](docs/06-koodistandard.md) | Kaustade ja nimede põhjendused, vigade leping, turvalisus, testid |
| [07 Autentimine](docs/07-autentimine.md) | Sessioonid, vood, endpoint'id, Apple/Google seadistamine |
| [08 Pargid ja kaart](docs/08-pargid-ja-kaart.md) | Kaart, filtrid, lemmikud, asukoht, development build |
| [09 Kohalolek ja külastused](docs/09-kulastused.md) | Check-in, privaatsusreeglid, ajalugu, plaanid, hinnangud, teated |
| [10 Koerad ja tervis](docs/10-koerad-ja-tervis.md) | Fotod (privaatne hoidla, EXIF/GPS eemaldamine), profiilipilt, tervisekirjed, meeldetuletused |

## Käivitamine

Eeldused: Node.js ≥ 22.12 (soovitatav 24 LTS), Docker, iOS-i jaoks Xcode + CocoaPods, Androidi jaoks Android Studio.

```bash
npm install                 # kõik workspace'id
cp apps/api/.env.example apps/api/.env
npm run db:up               # Postgres + PostGIS, Redis ja MinIO (fotod, loob bucket'i) Dockeris
npm run db:migrate          # tabelid
npm run db:seed             # näidispargid Tallinnas
npm run dev:api             # API → http://localhost:3000
(cd apps/mobile && npx expo run:ios)   # development build (MapLibre, pildivalija); uuesti pärast natiivsete pakettide lisamist
npm run dev:mobile          # Metro development build'i jaoks
```

Äpi seaded: `cp apps/mobile/.env.example apps/mobile/.env.local`. Päris telefonis määra seal `EXPO_PUBLIC_API_URL=http://<arvuti-IP>:3000` ja API `.env`-is `S3_PUBLIC_ENDPOINT=http://<arvuti-IP>:9000` (fotode allkirjastatud URL-id tehakse selle aadressi järgi). MinIO konsool: http://localhost:9001 (`kapp` / `kapp-dev-secret`).

Arenduses saadetud parooli taastamise lingid ilmuvad API logisse (e-posti teenust veel pole).

## Kontrollid

```bash
npm run typecheck                          # kõik paketid
npm test                                   # API unit- ja HTTP-testid (ilma andmebaasita)
npm run test:integration -w @kapp/api      # PostGIS-i päringud ja MinIO (vajab db:up)
npm run lint -w mobile
```

## Struktuur

```
apps/mobile        Expo äpp (Expo Router, NativeTabs, Figma tokenid)
apps/api           Fastify API (modules/<valdkond>: routes → service → repository)
packages/shared    Zod-skeemid, tüübid, disainitokenid — jagatud äpi ja API vahel
docs/              projekti dokumentatsioon
```
