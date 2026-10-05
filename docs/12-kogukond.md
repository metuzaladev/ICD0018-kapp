# 12. Kogukond: sõbrad, sõnumid, teavitused ja blokeerimine (M5)

## Mis on valmis

| Funktsioon | API | Äpp |
|---|---|---|
| Inimeste otsing | `GET /users/search?q=` (3–50 märki, kuni 20 tulemust) | `friends` → „Otsi sõpru" |
| Profiil | `GET /users/:userId` | `users/[userId]` (avaneb ka pargi külastajate realt) |
| Sõbrakutsed | `GET/POST /me/friend-requests`, `POST /me/friend-requests/:userId/accept`, `DELETE /me/friend-requests/:userId` | `friends` (sissetulevad, saadetud), profiili nupud |
| Sõbrad | `GET /me/friends`, `DELETE /me/friends/:userId` | `friends`, profiil → „Eemalda sõprade hulgast" |
| Sõprade plaanid | `GET /me/friends/plans` (järgmised 48 h) | avalehe kaart „Sõbrad lähevad parki" |
| Vestlused | `GET/POST /me/conversations`, `GET /me/conversations/:id` | `messages` (postkast), profiil → „Saada sõnum" |
| Sõnumid | `GET/POST /me/conversations/:id/messages` (`before`, `limit`), `PUT /me/conversations/:id/read` | `messages/[conversationId]` |
| Reaalaeg | Socket.IO `path=/api/v1/realtime`, sündmused `message:new`, `notification:new` | `lib/realtime.ts`, `hooks/use-community-runtime.ts` |
| Teavitused | `GET /me/notifications`, `GET /me/notifications/unread-count`, `PUT /me/notifications/:id/read`, `PUT /me/notifications/read-all` | vahekaart „Teated" + märk vahekaardil |
| Teavituste eelistused | `GET/PUT /me/notification-preferences` | `settings-notifications` |
| Push | `PUT /me/push-tokens`, `DELETE /me/push-tokens/:token`; BullMQ + `expo-server-sdk` | `lib/push.ts`, `components/push-prompt.tsx` |
| Blokeerimine | `GET /me/blocks`, `PUT/DELETE /me/blocks/:userId` | `report-user` → „Blokeeri kasutaja", `settings-privacy` |
| Kasutajast teavitamine | `POST /users/:userId/reports` | `report-user` |
| Privaatsus | `PATCH /me` (`allowFriendRequests`, `presenceSharing`, `language`) | `settings-privacy` |
| Pargikutse | plaan + sõnum | profiil → „Kutsu parki" → `invite-park` → `plan-visit` |

Kõik marsruudid nõuavad sessiooni (`401`), sisend käib läbi `parseRequest`-i ja jagatud skeemide (`packages/shared/src/community.ts`).

## Otsused ja põhjused

| Otsus | Põhjus |
|---|---|
| **Sõprus on vastastikune ja kinnitatav** (kutse → vastu võtmine / keeldumine; kumbki saab eemaldada) | Kohalolek „sõpradele" ja sõnumid on privaatsed; ühepoolne jälgimine annaks võõrale ligipääsu. Vastab andmemudeli lahtisele küsimusele (docs/03). |
| **Ühe paari kohta üks rida mõlemas suunas** — unikaalne indeks `friendships_pair_uq` avaldistel `least/greatest(requester_id, addressee_id)` | Kaks samaaegset vastassuunalist kutset ei saa tekitada kahte rida. Teine sisestus kukub; teenus loeb võitnud rea ja **võtab selle vastu**. |
| **Vastassuunaline kutse võtab vastu** | Kui B on A-d juba kutsunud, tähendab A „Saada sõbrakutse" sama mis „Võta vastu". |
| `POST /me/friend-requests` → `201` uus kutse, `200` kui olek juba oli | Korduv vajutus on ohutu (idempotentne), klient näeb tulemuse olekut (`pending` / `accepted`). |
| **Sõnumeid saab saata ainult sõpradele** (`403`) | Rämpspostivastane: võõras ei saa kirjutada. Pärast sõpruse lõppu jääb ajalugu loetavaks, uusi sõnumeid ei saa (`canMessage: false`). |
| **1:1 vestlus = `conversations.direct_key`** (`least:greatest`, unikaalne) | Kaks sõpra jagavad alati üht vestlust, ka siis, kui mõlemad avavad selle esimest korda samal hetkel (`on conflict do nothing` + uuesti lugemine). |
| **Otsing**: omaniku nimi või koera nimi, `ILIKE` metamärgid varjestatud, ainult eesnimi, piirkond ja koerte nimed | Leidmiseks piisab; e-post ja perekonnanimi ei lahku serverist. `%` otsib protsendimärki, mitte „kõike". |
| **„Luba sõbrakutseid" väljas** → kasutaja on otsingus näha (`acceptsRequests: false`), aga kutse annab `403` | Sõber leiab ta üles ja saab tema profiili vaadata; arusaadav „ei võta kutseid vastu" on parem kui kadunud inimene. |
| **Profiil**: võõras näeb eesnime, piirkonda, koerte nimesid ja tõuge; sõber lisaks tutvustust, koerte vanust ja iseloomu | Figma „Profiil nähtav pargisõpradele". |
| **Blokeering kehtib mõlemas suunas** ja peidab kasutajad teineteise eest kõikjal: otsing, profiil (`404`), sõbrad, kutsed, vestlused (`404`), teavituste voog, sõprade plaanid, pargi külastajad | Turvalisus: blokeeritu ei tohi isegi teada saada, et blokeerija on olemas. Reegel on SQL-is (`modules/safety/block-sql.ts`), nii et peidetud andmed ei lahku andmebaasist. |
| **Blokeerimine kustutab sõpruse ja ootel kutsed samas transaktsioonis** | Poolikut olekut (blokeeritud, aga sõber) ei saa tekkida. Blokeeringu eemaldamine sõprust ei taasta. |
| **Teavitamine on lubatud ka blokeeritud kasutaja kohta** | Figma voog on „teavita, siis blokeeri". |
| `PUT/DELETE /me/blocks/:userId` | Idempotentne: korduv vajutus ei anna viga. |
| **Teavituste tekste ei salvestata** (`type`, `actor_id`, `data jsonb`) | Äpp joonistab voo oma keeles (keelevahetus muudab ka vanad read), push'i kirjutab server saaja keeles. Vanad `title/body` veerud eemaldati (tabelit polnud enne M5 kasutatud). |
| **Üks lugemata „uus sõnum" teavitus vestluse kohta** | Iga sõnum ei täida voogu; uus sõnum uuendab olemasolevat rida (eelvaade, aeg). Vestluse avamine märgib selle loetuks. |
| **Eelistused puudutavad ainult push'i** | Voog on ajalugu, push on segamine. Lüliti „Sõnumid sõpradelt" väljas = sõnum on voos, aga telefon ei helise. |
| **Sõbra plaan**: teavitus kõigile sõpradele, plaanid avalehel 48 h ette; **mitte kui omaniku kohalolek on „mitte keegi"** | Kes ei jaga, kus ta praegu on, ei taha jagada ka seda, kus ta homme on. |
| **Push'i keel on kasutaja juures** (`user.language`) | Push koostatakse taustatöös, kus päringu `Accept-Language`-it pole. Äpp saadab keele koos push-märgiga ja `PATCH /me`-ga keele vahetusel. |
| **Pargikutse = plaan + tavaline sõnum** | Uut andmetüüpi pole vaja; sõber saab vastata samas vestluses, plaan teavitab ka teisi sõpru. |
| Sõnum 1–2000 märki (skeem + `CHECK messages_body_length`), lehekülgede kaupa uusimast (`before` = viimase näidatud sõnumi id, võti `(created_at, id)`) | Stabiilne ka siis, kui lehitsemise ajal tuleb uusi sõnumeid. |
| Kiiruspiirangud: kutse 30/h, otsing 60/min, sõnum 30/min, teavitamine 5/h, blokeerimine 30/h, push-märk 20/h | Rämpspost ja skriptid; teavitused on käsitsi modereerimise töö. |

## M11: avalehe pargitegevus

`GET /parks/activity?ids=` (avaleht → „Lemmikparkides täna", [docs/18](18-avalehe-tegevus.md)) loendab tänaseid plaane parkides. Reeglid on samas vaimus nagu sõprade plaanid ja pargi külastajad, SQL-is (`modules/park-activity/park-activity.repository.ts`, `block-sql.ts`):

| Plaani omaniku seade | Loetakse vaataja arvu sisse | Nimi vaatajale |
|---|---|---|
| „Kõik" | jah | ainult sõbrale |
| „Sõbrad" | ainult sõbrale | jah |
| „Mitte keegi" | ei kellelegi | — |
| Blokeering kummaski suunas | ei | — |

- Vaataja oma plaane ei loeta; vastuses pole kunagi kasutaja ID-sid ega võõraste nimesid (nimi loetakse SQL-is ainult sõbra puhul, ainult eesnimi).
- Erinevalt „Praegu pargis" varjatud koerte arvust (`hiddenDogs`) ei loeta „sõpradele" jagaja plaani võõrastele isegi anonüümselt: praegust kohalolekut näeb kohapeal igaüks, tulevane asukoht on ennustus, mida omanik pole võõrastega jaganud.
- Väikese arvu reeglit pole: arvu sisse lähevad ainult need, kes on lubanud sellel vaatajal oma kohalolekut näha.
- Privaatsusseade (Seaded → Privaatsus → „Kohaloleku jagamine") ütleb nüüd, et valik kehtib ka plaanidele.

## Reaalaeg (Socket.IO)

```
äpp ──REST──▶ POST /me/conversations/:id/messages ──▶ service ──▶ DB
  ▲                                                       │
  └──── Socket.IO "message:new" ◀── gateway.emitToUsers([saatja, saaja])
```

- **Miks Socket.IO, mitte paljas WebSocket või SSE:** taasühendus ootamisaja kasvuga, südamelöögid ja kasutaja-põhised „toad" on valmis (paljas `ws` vajaks seda kõike käsitsi ja testituna); kui WebSocket on võrgus blokeeritud, oskab see long-polling'ut; SSE on samuti ühesuunaline, aga React Native'is pole `EventSource`-i ja iOS katkestab taustal mõlemad, seega SSE ei annaks midagi juurde. `socket.io-client` on puhas JavaScript — natiivset moodulit pole vaja.
- **Samas Fastify serveris** (`src/realtime/socket-gateway.ts`, ühendatakse `buildApp`-is `app.server` külge); eraldi porti ega teenust pole.
- **Autentimine:** käepigistuses sama Better Authi sessiooniküpsis mis REST-is (`extraHeaders.cookie`, varuks `auth.cookie`). Ilma sessioonita `connect_error: unauthorized`; sessioonihoidla viga → `unavailable` (klient proovib uuesti).
- **Ainult server → klient.** Kõik kirjutamised käivad REST-i kaudu, nii et valideerimine, kiiruspiirangud ja veaformaat on ühes kohas. Iga sokkel liitub ruumiga `user:<id>`; sündmus saadetakse ainult nende kasutajate ruumidesse, keda see puudutab (vestluse liikmed, teavituse saaja).
- **Varuplaan:** kui sokkel pole ühendatud, pärib avatud vestlus ja postkast andmeid iga 15 s (TanStack Query `refetchInterval`), teavituste märk iga 60 s. Sokli katkemine teeb uuendused aeglasemaks, mitte kaduvaks.
- **Skaleerimine:** eeldab üht API instantsi. Mitme puhul lisada `@socket.io/redis-adapter` (Redis on push'i järjekorra jaoks juba olemas).

## Teavitused ja push

```
teenus (sõnum, kutse, plaan)
  └─▶ Notifier.notify()
        1. rida tabelisse notifications (või sõnumi puhul olemasoleva uuendamine)
        2. Socket.IO "notification:new" { notification, unreadCount }  → vahekaardi märk
        3. kui eelistus lubab: push-töö BullMQ järjekorda (tekst saaja keeles)
                                     │
                     BullMQ worker ◀─┘  (samas protsessis, PUSH_WORKER_ENABLED)
                       ├─ push_tokens → Expo push API (expo-server-sdk, 100 kaupa)
                       ├─ DeviceNotRegistered → märk kustutatakse
                       ├─ MessageRateExceeded / ExpoError / võrgu- ja 5xx-viga → kordus (5×, 10 s … 160 s)
                       │    korduses saadetakse ainult ebaõnnestunud seadmetele (topelt-push'e pole)
                       └─ 15 min pärast "receipts" töö → DeviceNotRegistered kviitungitelt → märk kustutatakse
```

- **Miks järjekord:** Expo kutse on aeglane väline päring, mis võib ebaõnnestuda või piirata. See ei tohi aeglustada ega nurjata „saada sõnum"-it ja ebaõnnestunud saatmised vajavad kordusi, mis elavad üle serveri taaskäivituse — BullMQ hoiab töid Redises.
- **Notifier ei viska kunagi viga:** kasutaja tegevus on juba salvestatud; teavituse viga ainult logitakse. Redise lisamisel on 2 s ajapiirang ja `enableOfflineQueue: false`, nii et surnud Redis ei hoia päringut kinni.
- **Push'i sisu:** pealkiri ja tekst jagatud tabelitest (`push.*` võtmed, `packages/shared/src/i18n`), plaani aeg Tallinna ajas saaja keele vormingus („R 17.00–18.00"). Sõnumist läheb push'i ainult 120-märgine eelvaade.
- **`data`** push'is: `type`, `notificationId`, `conversationId` / `userId` — äpp avab puudutamisel õige ekraani.
- **Märgid:** `PUT /me/push-tokens` (Expo märgi vorming valideeritud) seob märgi kasutajaga ja salvestab keele; teise kontoga sisse logides märk liigub uuele kasutajale. Väljalogimisel kustutab äpp oma märgi.
- **Äpis:** enne süsteemi dialoogi näidatakse selgitust („Kas anname märku?", vahekaardil „Teated" ja seadetes), sest iOS küsib ainult korra. „Mitte praegu" jäetakse meelde (AsyncStorage). Androidil luuakse kanal `default`.

## Keskkonnamuutujad

| Muutuja | Vaikimisi | Milleks |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | BullMQ järjekord (docker-compose, CI teenus) |
| `PUSH_QUEUE_PREFIX` | `kapp` | Redise võtmete eesliide (testid kasutavad omaenda ja kustutavad selle) |
| `EXPO_ACCESS_TOKEN` | — | Ainult kui Expo projektis on „Enhanced security for push notifications" |
| `PUSH_WORKER_ENABLED` | `true` | `false`, kui push'e saadab eraldi protsess |

Äpp vajab push-märgi jaoks EAS projekti ID-d (`npx eas-cli@latest init` → `app.json` `extra.eas.projectId`). Ilma selleta jätab äpp registreerimise vahele (arenduses hoiatus logis), kõik muu töötab.

## Andmebaas (migratsioon `0005_m5_community`)

- `user.allow_friend_requests` (vaikimisi `true`), `user.language` (`CHECK in ('et','en','ru')`, vaikimisi `et`).
- `friendships`: `friendships_pair_uq` (mõlemas suunas üks rida), `CHECK requester_id <> addressee_id`, indeks `addressee_id`.
- `conversations.direct_key` (unikaalne), `conversation_members_user_idx`.
- `messages`: `CHECK char_length(body) between 1 and 2000`.
- `notifications`: `actor_id` (FK, `on delete cascade`), `data jsonb`, `CHECK type in (...)`; `title`/`body` eemaldatud, olemasolevad (kasutamata) read kustutatakse.
- `notification_preferences` (rida puudub = kõik sees).
- `push_tokens.updated_at`; `user_blocks`: `CHECK blocker_id <> blocked_id`, indeks `blocked_id`; `user_reports.details`, `CHECK reason in ('spam','harassment','other')`; `planned_visits_user_time_idx`.

## Testid

- **Unit** (`test/unit/m5-services.test.ts`, `push-worker.test.ts`): sõbrateenus (kutse, idempotentsus, vastassuunaline kutse, samaaegsuse unikaalsusrikkumine, keelatud kutsed, plaanist teavitamine), sõnumiteenus (ainult sõbrad, blokeering → 404, sündmus mõlemale liikmele, eelvaade), turvalisus, teavitusteenus, Notifier (eelistus, saaja keel, Redise viga ja 2 s ajapiirang vale-taimeritega), push-tekstid kolmes keeles ja Tallinna ajas, worker (DeviceNotRegistered, osaline kordus ainult ebaõnnestunud seadmetele, kviitungid) ja **päris `expo-server-sdk` mock'itud Expo otspunkti vastu** (undici `MockAgent`, võrk keelatud).
- **HTTP** (`test/http/m5.routes.test.ts`, 58): kõik marsruudid 401, 400 (puuduv, `null`, vale tüüp, tundmatu väli, vigane ID/kursor/märk), 403/404/409/429/503, `Accept-Language` en/ru uute vigade jaoks.
- **Integratsioon** (`test/integration/community.flow.test.ts`, päris PostgreSQL + Redis + Socket.IO): otsing nime ja koera järgi, `%` varjestus, keelatud kutsed, kutse → teavituse rida → push-töö vene keeles, vastu võtmine → kohalolek „sõpradele" nähtav, sõbra plaan avalehel ja teavitusena, sokkel ilma sessioonita lükatakse tagasi, sõnum jõuab sokli kaudu ainult liikmetele, lugemata arv ja üks teavitus vestluse kohta, lugemine, lehekülgede kaupa laadimine, eelistus peatab push'i, worker mock'itud Expo vastu kustutab kadunud seadme märgi, blokeering peidab kõikjal ja peatab sõnumid, teavitamine, blokeeringu eemaldamine ei taasta sõprust.

## Mida pole kontrollitud

- **iOS-i simulaatoris ega seadmes pole ühtegi M5 ekraani vaadatud ega läbi klõpsatud** (arenduskeskkonnas polnud simulaatorit). Kontrollitud on `tsc` (koos tüübitud marsruutidega), lint, `i18n:check`, `expo-doctor` ja API testid.
- **Vajab uut development build'i:** `expo-notifications` on natiivne moodul (`npx expo run:ios`). `socket.io-client` on puhas JS.
- Päris push'i pole saadetud: puudub EAS projekti ID ja füüsiline seade (iOS-i simulaator push-märki ei anna). Expo teenust ei kutsuta testides kunagi.
- React Native'i WebSocketi `extraHeaders` küpsis on eeldatud (varuks `auth.cookie`); sokli ühendust on testitud Node'i `socket.io-client`-iga.
- Push'i puudutamisel avanev ekraan ja Androidi kanal on kirjutatud, aga seadmes proovimata.
- Mitme API instantsi korral vajab Socket.IO Redise adapterit (pole lisatud).
- Kasutajate teavituste modereerimiseks pole adminivaadet (nagu pargiteadetel).
- Inglis- ja venekeelsed tekstid vajavad emakeelse kõneleja ülevaatust.
