# 13. Teenused ja broneeringud (M6)

Koeraomanik leiab teenusepakkuja (hooldus, treening, kliinik), valib teenuse, vaba aja ja oma koera(d) ning broneerib. Broneeringud on profiilis „Minu broneeringud" all, neid saab tühistada kuni 2 tundi enne algust ja enne algust tuleb meeldetuletus.

> **Makseid ei ole.** Hind on informatiivne („alates 35 €"), täpne hind lepitakse teenusepakkujaga kokku ja makstakse väljaspool äppi. Äpp ei loo ühtegi kontot ega kasuta väliseid broneerimis- või makseteenuseid.
>
> **Teenusepakkujad on väljamõeldud näidisandmed** (`npm run db:seed`), äpp ütleb seda nimekirja all („Teenusepakkujad, hinnad ja ajad on näidisandmed.").

## Mis on valmis

| Funktsioon | API | Äpp |
|---|---|---|
| Teenusepakkujad | `GET /service-providers?category=&lat=&lng=&radiusKm=` (avalik) | `services` — „Natuke hoolt. Palju rõõmu.", kategooriakiibid |
| Pakkuja ja teenused | `GET /service-providers/:providerId` (avalik) | `services/[providerId]` — teenuse valik, „Vali sobiv aeg" |
| Vabad ajad | `GET /services/:serviceId/slots?from=&days=` (avalik, 1–14 päeva, vaikimisi 7 alates tänasest Tallinnas) | `book` (modaal) — kuupäeva- ja kellaajakiibid |
| Broneerimine | `POST /me/bookings` (20 tunnis) | `book` — koerad, märkus, hind, „Kinnita broneering", „Kohtumiseni!" |
| Minu broneeringud | `GET /me/bookings?scope=upcoming\|past`, `GET /me/bookings/:bookingId` | `bookings` — „Tulevased" / „Varasemad" |
| Tühistamine | `POST /me/bookings/:bookingId/cancel` (idempotentne, 30 tunnis) | kinnitusdialoog „Tühistada broneering?" |
| Teavitused | voog: `booking_confirmed`, `booking_cancelled`, `booking_reminder`; push ainult meeldetuletusele | vahekaart „Teated", eelistus „Broneeringute uuendused" |

Sisenemine: Profiil → „Minu broneeringud" (Figma), sealt „Leia uus teenus"; lisaks avalehe rida „Teenused" (vt [docs/11](11-tolked-ja-figma.md#teadlikud-erinevused-figmast)).

## Andmemudel (migratsioon `0006_m6_services`)

```
service_providers ─┬─< provider_hours   (weekday 1–7, opens_at, closes_at — kohalik aeg)
                   └─< services ──< bookings >── user
                                      └─< booking_dogs >── dogs
```

| Tabel | Olulised veerud ja piirangud |
|---|---|
| `service_providers` | `category` (`grooming`/`training`/`vet`/`other`), `tagline`, `area` (linnaosa), `location` (PostGIS, GiST), `time_zone` (vaikimisi `Europe/Tallinn`), `photo_key` (valikuline), `rating_average` 1–5 + `rating_count` |
| `provider_hours` | PK `(provider_id, weekday, opens_at)` — mitu rida päevas = lõunapaus; `CHECK closes_at > opens_at`, `weekday between 1 and 7` |
| `services` | `duration_minutes` 5–480, `price_cents ≥ 0` (täisarv, sentides), `price_is_from`; unikaalne `(id, provider_id)` liitvõtme jaoks |
| `bookings` | `provider_id` + `service_id` (liitvõti → `services(id, provider_id)`, `restrict`), `starts_at`/`ends_at`, hinna koopia, `status` (`confirmed`/`cancelled`/`completed`), `cancelled_at` (`CHECK`: olemas parajasti siis, kui tühistatud), märkus ≤ 300 (`CHECK`) |
| `booking_dogs` | `(booking_id, dog_id)`; koera kustutamine eemaldab ta broneeringust, broneering jääb ajalukku |
| `bookings_no_overlap` | `EXCLUDE USING gist (provider_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE status <> 'cancelled'` (laiendus `btree_gist`) |

Vanad M0 kohatäited `services` ja `bookings` (ilma API ja andmeteta) asendati; `service_providers` uued kohustuslikud veerud kukuksid valjult, kui keegi oleks sinna käsitsi ridu lisanud.

## Reeglid

| Reegel | Kus | Põhjus |
|---|---|---|
| **Ühel pakkujal ei saa olla kahte kattuvat aktiivset broneeringut**, ka eri teenustele | Andmebaas: `bookings_no_overlap` (23P01 → `409 errors.slotTaken`); teenus kontrollib enne sõbraliku teate jaoks | Hooldaja ei saa pesta Freddyt 10.00–11.00 ja lõigata küüsi 10.30. Osaline unikaalne indeks `(service_id, starts_at)` (M0 plaan) ei näeks kattuvaid eri pikkusega aegu; vahemiku välistuspiirang näeb ja serialiseerib samaaegsed sisestused — täpselt üks läbib. Pool-avatud `[)`: 10–11 ja 11–12 sobivad mõlemad. Tühistatud read ei loe, seega tühistamine vabastab aja. |
| **Pakkuja mahutavus on 1** | Mudel | Lihtne ja aus näidisandmetele. Mitme hooldajaga salong vajaks tulevikus `resources` tabelit (välistuspiirang `resource_id` peal). |
| **Vabad ajad arvutatakse lugemisel** lahtiolekuaegadest, 30-minutilise sammuga, teenuse kestus peab enne sulgemist ära mahtuma | SQL (`providers.repository.ts`, üks päring) | Ajatabelit ei pea keegi täitma ega puhastama; lahtiolekuaja muutus kehtib kohe. |
| **Ajad on pakkuja ajavööndis** (`(päev + kellaaeg) at time zone time_zone`) | SQL; äpp näitab ka pakkuja ajavööndis | 10.00 jääb 10.00-ks ka suveaja vahetusel. Telefon välismaal näeb sama kellaaega, mida hooldaja ootab (ja vihjet ajavööndi kohta). „Täna" on Tallinna täna, mitte serveri või telefoni oma (`lib/calendar.ts`). |
| **Broneerida saab ainult pakutud aega** | Teenus küsib sama vaba-aja päringut ühe päeva kohta ja võrdleb hetke | „Mida näed" = „mida saad broneerida": ruudustikust väljas, suletud, möödas või võetud aeg → `409 errors.slotUnavailable`. |
| **Broneerida ja tühistada saab kuni 2 tundi enne algust; ette kuni 60 päeva** | `BOOKING_CUTOFF_MINUTES`, `BOOKING_HORIZON_DAYS` (`packages/shared`), puhtad funktsioonid `booking-rules.ts` | Üks number mõlemas suunas on lihtne selgitada ja annab pakkujale sama etteteatamise. Makseid pole, seega pikem piir ei kaitseks kedagi, vaid takistaks kasutajal aega vabastamast. Piiri ületamisel `409 errors.cancelTooLate` (tundidega teates). |
| **Ainult oma koerad** (1–3) | Teenus: `dogs.ownedIds`; võõras/puuduv → `404` | Nagu check-in; 404, et võõraste koerte ID-d ei kinnituks. 3, sest seanss on ühe külastuse kohta. |
| **Võõras broneering annab 404** | Repositoorium filtreerib `user_id` järgi | Sama reegel kui mujal (docs/06). |
| **Tühistamine on idempotentne** | Tingimuslik `UPDATE … WHERE status = 'confirmed'` | Topeltvajutus vastab mõlemale `200` sama tühistatud broneeringuga ja teavitab ainult korra. |
| **Broneering kinnitub kohe** (`confirmed`) | — | Pakkujapoolset vaadet ega kinnitust pole (teenusepakkujad ei ole äpi kasutajad — vastus docs/03 lahtisele küsimusele). |
| **„Toimunud" (`completed`) tuletatakse lugemisel** (kinnitatud + lõppenud) | `effectiveStatus` | Nagu check-in'i aegumine: tööd, mis ridu ümber kirjutaks, pole vaja. Salvestatud `completed` on reserveeritud tulevasele pakkuja „tehtud / ei tulnud" voole. |
| **Hind salvestatakse broneeringusse** | `bookings.price_cents`, `price_is_from` | Hinna muutus ei muuda ajalugu. |
| **Kataloog on avalik**, broneeringud ainult `/me` | Marsruudid | Pakkujate andmed ja vabad ajad ei sisalda isikuandmeid (võetud aeg ei ütle, kelle oma). |
| Kiiruspiirangud: broneerimine 20/h, tühistamine 30/h | `bookings.routes.ts` | Iga broneering blokeerib pakkuja aja — skript ei tohi kalendrit täita. |

## Teavitused ja meeldetuletus

- **Kinnitus ja tühistamine** lähevad `Notifier`-i kaudu voogu ja reaalajas sündmusena (`push: false`): kasutaja tegi selle ise samas telefonis ja näeb tulemust ekraanil, push kordaks seda. Rida jääb voogu ajaloona.
- **Meeldetuletus** on hilinenud BullMQ töö (`booking-reminders` järjekord samas Redises, töö ID `reminder-<bookingId>`): 24 h enne algust; kui see on juba möödas, siis 2 h enne; kui ka see jääks broneerimisele lähemale kui 1 h, siis mitte üldse. Worker loeb broneeringu uuesti ja jätab tühistatu, kustutatu või juba alanu vahele, nii et ka eemaldamata töö ei tee kahju. Tühistamine eemaldab töö (parima tahte järgi).
- Push tuleb **saaja keeles** ja ainult siis, kui Seaded → Teavitused → **„Broneeringute uuendused"** on sees (`notification_preferences.bookings`, vaikimisi sees). Aeg Tallinna ajas („R 3. okt 10.00").
- Redise viga ei nurja broneeringut: ajastamisel on 2 s piir, viga logitakse.
- Worker käivitub koos push-workeriga (`PUSH_WORKER_ENABLED`), sest selle ainus väljund on push.

## Otsused, mis täidavad lünki või erinevad Figmast

| Teema | Otsus | Põhjus |
|---|---|---|
| Kategooriad | Figma kolm kiipi + „Kõik" ees, kerib külgsuunas | Valikust loobumine peab olema nähtav; vene sildid on pikad. `other` on andmemudelis, kiipi pole (andmeid pole). |
| „Service / Groomer" | Teenused raadionuppudena, odavaim eelvalitud, siis „Vali sobiv aeg" | Figma näitab teenuseid ja üht nuppu; valik peab olema selge ja VoiceOveriga loetav. |
| „Booking / Select Time" | Ühel ekraanil kuupäev, kellaaeg, **kes tuleb**, märkus, hind, tühistamisreegel; pealkiri sõltub kategooriast | Figma pealkiri „Aeg iseendale. Ja puhtale karvale." sobib ainult hooldusele; treening/kliinik said oma. Koera valikut Figmas pole, aga broneering on koera kohta. |
| „Booking / Confirmed" | Kaart „{koerad} · {teenus}" + aeg, pakkuja, hind | „Freddy hooldusaeg" nõuaks nime käänamist (docs/11). |
| Näidisandmete märge | „Teenusepakkujad, hinnad ja ajad on näidisandmed." | Figma „… on disaini näidisandmed." — äpis on andmed päris API-st, aga pakkujad väljamõeldud. „Tuleviku vaade" ja „· kontseptsioon" / „· näidisbroneering" eemaldati. |
| Hinnang | Pakkuja kureeritud `rating_average` ja arv | Pakkujate arvustusi äpis pole; väli on informatiivne. |
| Pakkuja foto | Valikuline, privaatses hoidlas, allkirjastatud URL | Sama mehhanism kui koera fotodel; seemnes fotosid pole. |

## Testid

- **Unit** (`test/unit/m6-services.test.ts`, 61): reeglid (aken, tühistamise piir täpselt piiril, `completed`, meeldetuletuse aeg), kalender (Tallinna päev ümber kesköö ja suveaja lõpu), välistusrikkumise tuvastus, skeemid, ProvidersService (kaugus, foto allkiri ja hoidla viga → 503, 404, päevade rühmitamine ja tühjad päevad, vaikimisi „täna Tallinnas", timeout vale-taimeritega), BookingsService (edu, 404 teenus/koer, möödas/piiri sees/horisondist väljas → 409 ilma andmebaasita, pakkumata aeg, sama hetk teise nihkega, võidujooks → `slotTaken`, muud vead ei maskeeru, Redise viga ja 2 s timeout ei nurja broneeringut, meeldetuletuseta lühike broneering, tühistamise idempotentsus ja topeltvajutus, meeldetuletuse vahelejätmine), Notifier (`push: false`, eelistus, saaja keel, `bookingId` push'is) ja push-tekstid kolmes keeles.
- **HTTP** (`test/http/m6.routes.test.ts`, 45): avalikud marsruudid ja query-vead, 401 enne valideerimist, puuduv/`null`/vale tüüp/tundmatu väli/kliendi hind, 415, vigane JSON, 404/409/503/500, `Accept-Language` en/ru, rate limit 429.
- **Integratsioon** (`test/integration/bookings.flow.test.ts`, päris PostgreSQL + Redis): kaugus ja kategooria, tähestik ilma asukohata, 23 vaba aega 08–20 Tallinna ajas 30 min sammuga, võõras koer 404, ruudustikust väljas ja möödas 409, broneering ja kadunud kattuvad ajad (ka teise teenuse puhul, kõrvuti sobib), teine kasutaja 409, **6 samaaegset päringut samale ajale → täpselt üks 201**, andmebaas ise keelab kattumise (23P01) ja teise pakkuja teenuse (FK), võõras ID 404, voo read, tühistamine (idempotentne, vabastab aja), piiri sees tühistamine 409 inglise keeles, `completed`, koera kustutamine, päris BullMQ hilinenud töö → worker → push inglise keeles, eelistus väljas → push'i pole, töö eemaldamine.

## Mida pole kontrollitud

- **iOS-i simulaatoris ega seadmes pole ühtegi M6 ekraani vaadatud** (arenduskeskkonnas simulaatorit polnud). Kontrollitud: `tsc` koos genereeritud tüübitud marsruutidega, lint, `i18n:check`, API unit-/HTTP-/integratsioonitestid.
- Hermes'e `Intl` `timeZone` valik ja EUR-vorming („35 €" / „€35") on eeldatud, mitte seadmes nähtud.
- Pakkujate haldusvaadet pole (andmed tulevad seemnest / adminilt). Pakkuja ei saa broneeringust teadet.
- Sama kasutaja kattuvaid broneeringuid eri pakkujate juures ei keelata (koer ei saa olla kahes kohas korraga) — lisatav kontroll.
- Inglis- ja venekeelsed tekstid vajavad emakeelse kõneleja ülevaatust.
