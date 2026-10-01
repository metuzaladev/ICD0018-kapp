# 8. Pargid ja kaart (M2)

## Mis on valmis

| Osa | Kus | Märkus |
|---|---|---|
| Kaart | `components/park-map.tsx` | MapLibre React Native 11, OpenFreeMap vektorkaart (hele `liberty`, tume `dark`), markeril praeguste koerte arv, kasutaja asukoht |
| Lähimad pargid | `GET /api/v1/parks/nearby` | PostGIS `ST_DWithin`, sorditud kauguse järgi, max 50; filtrid `fenced`, `smallDogArea`, `water`, `lighting` |
| Pargi leht | `app/parks/[parkId].tsx`, `GET /api/v1/parks/:parkId` | Hinnangute keskmine ja arv, praegused koerad, omadused, „Juhata kohale" (Apple Maps / Androidi kaardirakendus), lemmiku süda |
| Filtrid | `app/park-filters.tsx` | Modaal; muudatused rakenduvad alles „Näita parke" järel |
| Lemmikud | `PUT`/`DELETE`/`GET /api/v1/me/favorites` | Idempotentsed; ainult avalikud pargid; optimistlik süda |
| Asukoht | `hooks/use-device-location.ts` | Ainult „rakenduse kasutamise ajal"; selgitus enne süsteemidialoogi; keelamisel Tallinna kesklinn |
| Andmete vahemälu | TanStack Query (`lib/query-client.ts`) | 60 s värske, 30 min mälus; 4xx-i ei korrata; võrgu kadumisel paus |
| Offline | `components/offline-banner.tsx` | Viimati laaditud andmed jäävad nähtavaks |

## Otsused ja põhjused

- **Asukoht ümardatakse ~100 m täpsuseni**, enne kui see API-le läheb. Lähima pargi leidmiseks piisab sellest ja server ei saa kunagi kasutaja täpset asukohta. See hoiab ka vahemälu võtme stabiilsena, kui kasutaja seisab paigal.
- **Kaamera sobitatakse kasutaja ja kõigi parkide piiridesse**, aga alles pärast `onDidFinishLoadingMap`-i. Enne stiili laadimist saadetud kaamerakäsud jätab natiivne kaart tähelepanuta (leitud simulaatoris testides).
- **Lemmikud on `PUT`/`DELETE`, mitte `POST`.** Topeltvajutus või võrgutõrke järel kordamine ei tekita duplikaate.
- **Mitteavalik park annab 404** ka lemmikuks lisamisel, et modereerimata parkide ID-sid ei saaks välja selgitada.
- **Lemmiku eemaldamine ei kontrolli parki**, et kasutaja saaks eemaldada ka hiljem tagasi lükatud pargi.
- **Filtri `false` tähendab „pole oluline"**, mitte „ei tohi olla". Nii ei kaota „vett pole vaja" ühtegi parki.
- **Figma „Koerte suurus" jäi välja**, sest pargi andmetes pole koerte suuruse infot. See tuleb lisada andmemudelisse, kui on selge, mida see tähendab (eraldi alad? soovituslik?).

## Leitud ja parandatud viga

Aktiivsete koerte loendur ja hinnangute kokkuvõte tagastasid alati 0. Drizzle kirjutab ühe tabeli päringus `${parks.id}` lihtsalt kujul `"id"`; alampäringu sees viitas see alampäringu enda tabelile, mitte pargile. Parandus: välise rea viide on selgesõnaline `"parks"."id"` (`OUTER_PARK_ID`). Integratsioonitest loob nüüd päris check-in'id ja hinnangud ning kontrollib numbreid.

## Arendus: development build

MapLibre sisaldab natiivset koodi, seega **Expo Go enam ei sobi**. Vaja on development build'i (üks kord ja iga kord, kui lisandub natiivne pakett):

```bash
cd apps/mobile
npx expo run:ios              # vajab Xcode'i ja CocoaPodsi (brew install cocoapods)
npm run dev:mobile            # edaspidi: Metro + development build
```

Kui `expo run:ios` küsib allkirjastamise sertifikaati (CLI peab simulaatorit füüsiliseks seadmeks), ehita simulaatori jaoks otse:

```bash
cd apps/mobile/ios
xcodebuild -workspace Kpp.xcworkspace -scheme Kpp -configuration Debug \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/Kpp.app
```

**Ära ehita `CODE_SIGNING_ALLOWED=NO`-ga.** Ilma ad-hoc allkirjata puudub äpil Keychaini õigus ja SecureStore (sessiooniküpsis) ei tööta. Selle tõttu on `lib/api.ts` nüüd vastupidav: Keychaini viga ei murra avalikke päringuid.

## Kontrollitud

- iOS 26.5 simulaatoris simuleeritud asukohaga Kadriorus: kaart, markerid, kasutaja asukoht, kaamera sobitus, nimekiri kaugustega, pargi leht, filtrite modaal.
- API: 119 unit/HTTP testi, 21 integratsioonitesti (filtrid, hinnangud, aktiivsed koerad, lemmikute voog päris sessiooniga).

## Kontrollimata

- Androidi kaart (Android Studio puudub).
- Lemmiku südame vajutamine ja filtrite lülitid simulaatoris: ma ei saa simulaatoris puudutada. API ja voog on testitud, UI vajab käsitsi läbiproovimist.
- Offline-bänner: testitud ainult koodi ja tüüpide tasemel, mitte võrgu väljalülitamisega.
