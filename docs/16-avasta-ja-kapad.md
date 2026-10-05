# 16. Avasta, Käpad ja Pood (M9b)

Figma leht **„09 / Explore & Rewards"**: kasutajad soovitavad koerasõbralikke kohti (Avasta), kaardil on kohad siltide kaupa, tegevuse eest kogub kasutaja **Käppasid** (punkte, tasemed, seeria, märgid) ja saab neid partnerite juures soodustuseks vahetada (Pood).

API tuli harus `feature/m9b-api`, äpi vaated harus `feature/m9b-app` (vt [Äpp (M9b-app)](#äpp-m9b-app)); M9a värskendas samal ajal äpi visuaali. Seepärast on uued lepingud eraldi failis `packages/shared/src/explore.ts` ja kõik muudatused olemasolevates voogudes on tagasiühilduvad (vt [Ühilduvus praeguse äpiga](#ühilduvus-praeguse-äpiga)).

> **Makseid ei ole.** Pood ei müü midagi: Käpad vahetatakse ühekordse sooduskoodi vastu, mida partner kontrollib kohapeal. Hinnad on informatiivsed nagu M6-s.
>
> **Näidisandmed on väljamõeldud.** Seeme (`npm run db:seed`) lisab viis heakskiidetud näidispostitust (kohvikud, metsarada, rand, pood — nimed on välja mõeldud, koordinaadid ligikaudsed), partnerite soodustused ja kaheksa toodet M6 näidispakkujatele. Postituste autor on süsteemikasutaja „Käpp kogukond", kellel pole sisselogimisviisi.

## Endpoint'id

Kõik `/api/v1` all. „Avalik" = sessioon pole vajalik, aga sisse loginud vaataja näeb oma meeldimisi ja blokeeringud kehtivad.

| Funktsioon | API | Piirang |
|---|---|---|
| Avasta voog | `GET /place-posts?lat&lng&radiusKm&category&scope=all\|friends&before&limit` (avalik; `friends` vajab sessiooni) | — |
| Postitus | `GET /place-posts/:postId` (avalik) | — |
| Kaardi kohad | `GET /map/places?minLat&minLng&maxLat&maxLng&tags=parks,cafes,…` (avalik, ala ≤ 1°, ≤ 300 kohta) | — |
| Foto üleslaadimine | `POST /me/place-posts/uploads` `{contentType, byteSize}` → allkirjastatud PUT | 40/h |
| Soovita kohta | `POST /me/place-posts` `{name, category, lat, lng, address?, amenities[], body?, photoUploadKeys[≤5]}` → `201`, `status: pending` | 10/h |
| Minu postitused / salvestatud | `GET /me/place-posts`, `GET /me/place-posts/saved` (`before`, `limit`) | — |
| Kustuta oma | `DELETE /me/place-posts/:postId` → `204` | — |
| Meeldib / salvesta | `PUT` / `DELETE /place-posts/:postId/like` ja `/save` → `{liked, saved, likeCount}` (idempotentne) | 300/h |
| Teavita postitusest | `POST /place-posts/:postId/reports` `{reason: spam\|inappropriate\|wrong_info\|other, details?}` | 5/h |
| Käpad | `GET /me/rewards` → saldo, tase ja edenemine, seeria (viimased 7 päeva), märgid, „kuidas teenida" | 60/min |
| Ajalugu | `GET /me/rewards/history?before&limit` | — |
| Kutsu sõber | `GET /me/invite` → `{code, points}`; `POST /me/invite/claim` `{code}` → `204` | 10/h |
| Pood | `GET /shop?lat&lng` (kategooriad, partnerid soodustusega, populaarsed tooted), `GET /shop/products?category&providerId`, `GET /shop/products/:productId` (avalik) | — |
| Lunasta | `POST /me/redemptions` `{offerType: booking\|product, offerId, idempotencyKey?}` → `201` uus kood / `200` sama võtmega kordus | 10/h |
| Minu koodid | `GET /me/redemptions`; `POST /me/redemptions/:id/cancel` (tagastab punktid, idempotentne) | 30/h |
| Soodustus broneeringule | `POST /me/bookings` + valikuline `redemptionId` → vastuses `discount: {redemptionId, discountPercent, discountedPriceCents}` | 20/h (M6) |
| Teavitused | `GET /me/notifications?include=rewards`, `GET /me/notifications/unread-count?include=rewards`; eelistus `rewards` (`PUT /me/notification-preferences`) | — |

Vigade leping on sama mis mujal (docs/06): `400` vigane sisend (sh `Koht peab asuma Eestis`), `401`, `404` ka võõra või peidetud ID korral, `409` konflikt (`Käppasid ei ole piisavalt: vaja 150, sul on 40`, kasutatud kood, liiga hilja sisestatud kutsekood), `429`, `503`.

## Andmemudel (migratsioon `0007_m9b_explore_rewards`)

```
place_posts ──< place_post_photos (position 0–4)
     ├──< place_post_likes  (post_id, user_id) PK
     ├──< place_post_saves  (post_id, user_id) PK
     └──< place_post_reports (post_id, reporter_id) unikaalne

reward_ledger (ainult lisamine) ──> reward_balances (1 rida kasutaja kohta, lukk + CHECK ≥ 0)
reward_milestones (millest on juba teatatud: tase/märk)
invite_codes (1 kood kasutaja kohta) · referrals (invitee PK → inviter)

service_providers.paw_discount_percent ──< partner_products
redemptions ──> reward_ledger (−punktid, source_id = redemption id)
bookings.redemption_id (unikaalne) → redemptions
```

| Tabel | Olulised piirangud |
|---|---|
| `place_posts` | `category` enum (`cafe`, `park`, `beach`, `shop`, `other`), `amenities place_amenity[]` (laiendatav enum), PostGIS punkt + GiST, `CHECK place_posts_in_estonia` (sama kast mis `ESTONIA_BBOX`), nimi 2–80, tekst ≤ 1000, aadress ≤ 200, `status` `pending → approved/rejected`, `moderated_at` olemas parajasti siis, kui pole `pending` |
| `place_post_photos` | `(post_id, position)` unikaalne ja `position between 0 and 4` → **kuni 5 fotot on andmebaasi reegel** |
| `place_post_likes` / `_saves` | liitvõti = **üks meeldimine kasutaja ja postituse kohta** |
| `reward_ledger` | `delta <> 0`, `day` (Tallinna kuupäev), **unikaalne `(user_id, reason, source_id)`** — sama sündmus ei saa kunagi kaks korda maksta; päästik `reward_ledger_append_only` keelab `UPDATE`-i ja otsese `DELETE`-i (kaskaad konto kustutamisel on lubatud) |
| `reward_balances` | `balance >= 0` ja `lifetime_earned >= 0` (CHECK); iga kirjutaja lukustab rea (`select … for update`) |
| `redemptions` | `code` unikaalne (10 märki, ≈ 50 bitti CSPRNG-ist), `(user_id, idempotency_key)` unikaalne, soodustus 1–15 %, `used_at`/`cancelled_at` kooskõlas staatusega |
| `bookings` | `redemption_id` unikaalne (**üks kood = üks broneering**), `discount_percent` + `discounted_price_cents` koos |
| `notifications` | `type` CHECK laiendatud: `reward_level_up`, `reward_badge`, `place_post_approved`; `notification_preferences.rewards` (vaikimisi sees) |

## Teenimise reeglid

Kõik summad ja piirid on ühes kohas: `apps/api/src/modules/rewards/reward-rules.ts` (`REWARD_RULES`). Äpp saab need `GET /me/rewards` → `waysToEarn` kaudu, nii et ekraanil pole kunagi vananenud numbreid.

| Sündmus | Käpad | Piirang | Allika ID (unikaalne) |
|---|---|---|---|
| Check-in, mis on lõppenud ja kestis ≥ 20 min | +5 | 1 pargi kohta päevas, 3 päevas | `<parkId>:<päev>` |
| Seeria: kvalifitseeruv check-in täna **ja** eile | +5 | 1 päevas | `<päev>` |
| Planeeritud külastus peetud: sama pargi kvalifitseeruv check-in algas 30 min enne plaani kuni plaani lõpuni ja pärast plaani loomist | +5 | 1 päevas | plaani ID |
| Esimene hinnang pargile | +5 | 1 pargi kohta (muutmine ei maksa) | pargi ID |
| Soovitatud koht kiideti heaks | +15 | — | postituse ID |
| Kutsutud sõber tegi oma esimese kvalifitseeruva check-in'i | +25 | kokku 10 kutset | kutsutu ID |

„Päev" on alati **Europe/Tallinn** kalendripäev (`localDate`, ka 25-tunnine suveaja lõpu päev on üks päev). Päeva järgi lähevad ka piirangud ja seeria.

### Miks need reeglid (pettusekindlus)

- **Punkte annab ainult server** sellest, mida ta ise nägi (check-in, plaan, hinnang, heakskiit, kutsutu check-in). Ühtegi endpoint'i, mis punkte lisaks, ei ole; äpp ei saada kunagi summat (`.strict()` skeemid lükkavad `pointsCost` jms tagasi).
- **Check-in maksab alles siis, kui see on läbi ja kestis vähemalt 20 minutit.** „Sisse–välja" tsükkel ei anna midagi; piirang 3/päevas ja 1/park/päevas piirab, mida skript saab koguda (maksimaalselt 15 + 5 seeria päevas).
- **Hinnang maksab pargi kohta üks kord**, sest allika ID on park, mitte hinnangu rida: kustutamine ja uuesti kirjutamine ei anna uusi punkte.
- **Postitus maksab heakskiidul**, pärast seda, kui inimene on selle üle vaadanud.
- **Kutse maksab, kui kutsutu käib ise pargis** (kvalifitseeruv check-in), mitte registreerumisel: võltskontod on väärtusetud. Kood tuleb sisestada 14 päeva jooksul pärast liitumist (vanad kasutajad ei saa koode vahetada), oma koodi ei saa kasutada, blokeeritud paari kood on „ei leitud", üks kasutaja saab olla kutsutud üks kord (`referrals` PK) ja kutsuja saab tasu kuni 10 kutse eest.
- **Plaan maksab ainult siis, kui see tehti enne check-in'i**, nii et plaani ei saa tagantjärele „õigeks" kirjutada.
- **Tase sõltub kogu teenitud summast (`lifetime_earned`)**, mitte saldost: kulutamine ei langeta taset ja tagasimakse (`redemption_refund`) ei tõsta seda.

### Mida ei arvestata ja miks: jalutuskäigud

Figmas on „jalutuskäik" punktide allikana. **Seda ei maksta**, sest usaldusväärset distantsi allikat pole: kauguse mõõtmine vajaks pidevat taustal asukohta (iOS-i „Always" luba, akukulu, asukohaajalugu serveris — see on täpselt see isikuandmete hulk, mida Käpp väldib, docs/12 ja docs/15 GDPR), ja kliendi saadetud „kõndisin 5 km" oleks võltsitav ühe päringuga. Pargi check-in on server-poolne fakt, millel on juba privaatsusreeglid. Kui jalutuskäigud lisanduvad, peaks distants tulema seadme sammuloendurist (HealthKit/Google Fit) kliendi kinnitusena ja olema eraldi, madala piiriga reegel.

Teadaolev piirang: check-in ise ei kontrolli asukohta (M3 otsus), seega saab kodust „parki" märkida. Piirangud hoiavad selle kasu väikese; geotara on lisatav (`POST /me/check-ins` + `lat/lng` ja `ST_DWithin` pargi ümber).

### Kuidas punktid kirja lähevad (idempotentsus ja samaaegsus)

```
visits / reviews / place-posts / friends service
   └─▶ rewards.settle(userId)            (pärast põhitegevust; ei viska kunagi viga)
         tx: lockBalance (select … for update)
             facts = check-in'id, plaanid, hinnangud, heakskiidetud postitused, kutsutud (viimased 14 päeva)
             awards = computeAwards(facts)     ← puhas funktsioon, unit-testitud
             insert … on conflict (user_id, reason, source_id) do nothing returning
             reward_balances += sisestatud summa
         → taseme/märgi muutus → reward_milestones (PK) → Notifier (üks kord)
         → kui kutsutu kvalifitseerus: settle(kutsuja)
```

- **Ümberarvutamine**: `settle` arvutab puhtate reeglitega uuesti, mida viimaste 14 päeva faktid annavad, ja lisab puuduva. Unikaalne võti viskab juba makstud sündmused välja, seega topeltkutse, samaaegne kutse või kordus pärast viga **maksab täpselt korra** (integratsioonitest: 8 samaaegset `settle`-t → iga sündmus üks rida).
- **Miks mitte põhitegevuse transaktsioonis:** nõue oli, et punktide viga ei tohi põhitegevust nurjata. Kui tasu oleks check-in'i transaktsioonis, tühistaks luku ootamise aegumine ka check-in'i. Ümberarvutamine annab sama garantii (lõpuks täpselt üks kord) ilma sidumata. Viga logitakse (`rewards not settled`) ja järgmine `settle` parandab.
- **Millal arvutatakse:** check-in'i alustamisel (see võis sulgeda eelmise) ja lõpetamisel, hinnangu järel, postituse heakskiidul, kutse sisestamisel ja **Käppade vaate avamisel** — nii saab ka iseenesest aegunud check-in (päringut ei tule) oma punktid.
- **Päevapiirangud** loetakse lukustatud saldorea all koos juba makstutega, nii et samaaegsed arvutused ei ületa neid.

## Tasemed, seeria ja märgid

| Tase | Alates |
|---|---|
| `puppy` — Kutsikas | 0 |
| `park_friend` — Pargisõber | 200 |
| `park_legend` — Pargilegend | 500 |
| `pack_leader` — Karjajuht | 1000 |

Vastuses on `level.next.pointsToGo` ja `progress` (0…1). Nimed tõlgib äpp (`id` järgi); push'i jaoks on nimed `packages/shared/src/i18n` (`rewards.level.*`, `rewards.badge.*`).

**Seeria** = järjestikused Tallinna päevad kvalifitseeruva check-in'iga, mis lõpevad täna — või eile, kui täna pole veel käidud (hommikul ei näe seeria katkenud välja). `lastDays` on viimased 7 päeva vanimast tänaseni.

**Märgid arvutatakse** (ei salvestata), vastuses `unlocked`, `progress`, `target`:

| Märk | Tingimus |
|---|---|
| `early_bird` | kvalifitseeruv check-in algas enne 8.00 Tallinna aja järgi |
| `ten_parks` | 10 erinevat parki kvalifitseeruva check-in'iga |
| `explorer` | 3 heakskiidetud postitust |
| `kadriorg_legend` | 20 kvalifitseeruvat check-in'i ühes ja samas pargis (Figma nimi Kadrioru järgi) |

`reward_milestones` meenutab ainult seda, millest on juba teatatud, et „Uus tase!" ja „Uus märk!" tuleksid täpselt üks kord.

## Pood ja lunastamine

- **Partner** = M6 teenusepakkuja, kellel on `paw_discount_percent` (soodustus broneeringule) ja/või `partner_products` (toode, hind sentides, soodustus 1–15 %, valikuline pilt privaatses hoidlas, `active`).
- **Hind punktides** on üks seadistatav number: `POINTS_PER_DISCOUNT_PERCENT = 10` → −15 % maksab 150 Käppa (`MAX_DISCOUNT_PERCENT = 15`, ka CHECK andmebaasis). Klient nimetab ainult pakkumise; soodustuse ja hinna otsustab server.
- **Lunastamine** (`POST /me/redemptions`): ühes transaktsioonis lukustatud saldoreaga → kontroll `balance >= cost` → `redemptions` rida → negatiivne kanne (`reason = redemption`, `source_id = redemption id`) → saldo väheneb. **Samaaegsed lunastused ei saa sama punkti kaks korda kulutada** (integratsioonitest: 5 samaaegset päringut 150 punktiga → üks `201`, neli `409`, saldo 0). CHECK `balance >= 0` on viimane kaitseliin.
- **Idempotentsus:** äpp loob iga vajutuse kohta `idempotencyKey` (UUID). Kaotatud vastuse korral annab sama võtmega kordus esimese koodi (`200`) ja punkte uuesti ei võeta.
- **Kood** on juhuslik, 10 märki tähestikust ilma `0/O/1/I/L`-ita (ette lugedes ei aja segi), kehtib 30 päeva. **Partner kontrollib koodi kohapeal**; partneri vaadet ega koodi kontrolli endpoint'i selles etapis pole (vt allpool).
- **Tühistamine** (`POST /me/redemptions/:id/cancel`): aktiivne, kasutamata ja aegumata kood → `cancelled` + tagasimakse (`redemption_refund`, sama allika ID, nii et tagasimakse saab olla ainult üks). Korduv tühistamine on `200`; kasutatud või aegunud kood `409`.
- **Broneeringule** (`POST /me/bookings` + `redemptionId`): kood peab olema oma, aktiivne, aegumata, `booking`-tüüpi ja sama pakkuja oma. Kood märgitakse kasutatuks **samas transaktsioonis** broneeringuga (tingimuslik `UPDATE`), broneeringusse salvestatakse soodustus ja soodushind; `bookings_redemption_uq` ei lase üht koodi kahele broneeringule. **Broneeringu tühistamine vabastab koodi** (aktiivseks tagasi kuni aegumiseni), soodustus jääb broneeringu ajalukku. Makset ikka pole.

## Avasta: postitused ja modereerimine

- **Fotod** kasutavad M4 toru: allkirjastatud PUT (`uploads/<userId>/<uuid>`, tüüp ja suurus allkirjas) → server loeb ainult oma võtmeid (võõras võti `404`) → sharp kontrollib sisu ja kodeerib WebP-ks (≤ 1600 px + 400 px pisipilt), **EXIF ja GPS kaovad** → `places/<postId>/<photoId>/full.webp|thumb.webp` privaatses bucket'is → toorfail kustutatakse → lugemisel 15-minutilised allkirjastatud GET-id. Objektid enne rida; vea korral kustutatakse kirjutatud objektid (docs/06).
- **Nähtavus SQL-is:** teised näevad postitust ainult `approved` olekus ja kui keegi pole kedagi blokeerinud (`block-sql.ts`, mõlemas suunas — voog, detail, kaart, meeldimised, teavitamine). Autor näeb oma ootel postitusi voos ja kõiki (ka tagasi lükatud) „Minu postitustes". `scope=friends` = aktsepteeritud sõbrad (`friendsBetween`).
- **Voog** on uusimast vanemani, võtmega `(created_at, id)` (stabiilne, kui lehitsemise ajal tuleb uusi); asukohaga ainult raadiuses ja `distanceKm` ühe komakohaga.
- **Kommentaare selles etapis pole** (Figma kommentaariloendur jääb ära): kommentaarid vajaksid oma modereerimist, teavitusi ja blokeeringureegleid; sisu on vaja enne kogukonda kasvatada.
- **Teavitamine** (5/h, üks kord inimese ja postituse kohta, korduv saatmine tagastab sama ID); oma postitusest ei saa teavitada.
- **Modereerimine:** admin-vaade on väljaspool skoopi. Kursuse demo jaoks on käsk, mis kutsub sama teenust kui API:

  ```bash
  npm run moderate:post -w @kapp/api -- --pending                 # ootel postitused
  npm run moderate:post -w @kapp/api -- <postId> approve          # või reject
  ```

  Heakskiit maksab autorile +15 ja saadab „Sinu soovitus on avaldatud" (voog + push saaja keeles, kui eelistus „rewards" on sees). Otsus on lõplik ja idempotentne: teine käivitus ei muuda ega maksa midagi (tagasivõtmine tähendaks makstud punktide tühistamist, aga kanderaamat on ainult lisamiseks). Teenusemeetod `placePostsService.moderate` on valmis tulevasele admin-endpoint'ile.

## Kaardi kohad

`GET /map/places` tagastab ühe päringuga (`UNION ALL`, `&&` ümbrikuga GiST-indeksil) kõik kohad kastis koos sildiga, mida Figma täisekraankaart filtreerib:

| Silt | Allikas |
|---|---|
| `parks` — Pargid | heakskiidetud pargid + postitused `park` |
| `cafes` — Kohvikud | postitused `cafe` |
| `beaches` — Rannad | postitused `beach` |
| `services` — Teenused | pakkujad `grooming`, `training`, `other` |
| `clinics` — Kliinikud | pakkujad `vet` |
| `other` | postitused `shop`, `other` |

`kind` (`park` / `post` / `provider`) ütleb, millise detail-endpoint'iga ID avada. Kast on kuni 1° ja vastus kuni 300 kohta.

## Äpp (M9b-app)

| Vaade | Fail | Figma |
|---|---|---|
| Kaart (kohad siltidega, pakkuja kaart) | `app/(tabs)/map.tsx`, `components/park-map.tsx`, `components/provider-sheet.tsx` | 81:7510, 81:7764 |
| Avasta voog | `components/explore-feed.tsx`, `components/place-post-card.tsx` | 84:7825, 58:152 |
| Postitus, Minu soovitused, Teavita postitusest | `app/place-posts/[postId].tsx`, `app/place-posts/mine.tsx`, `app/report-post.tsx` | — |
| Soovita kohta | `app/suggest-place.tsx`, `components/location-picker.tsx` | 85:8637 |
| Käpad, ajalugu | `app/rewards/index.tsx`, `app/rewards/history.tsx` | 84:8169 |
| Pood, toode, Minu koodid, kood | `app/shop/index.tsx`, `app/shop/[productId].tsx`, `app/redemptions/*` | 85:8362, 58:136 |

Andmed käivad ainult hookide kaudu: `hooks/use-explore.ts`, `use-rewards.ts`, `use-shop.ts` (+ `use-redeem-once.ts`, `use-place-post-actions.ts`). `usePointsBalance()` loeb nüüd `GET /me/rewards` saldot, seega Points Badge ilmub avalehel (→ Käpad), kaardi otsingus (→ Käpad) ja Poes. Allkirjastatud pildi-URL-id (postitused, tooted) on 5 minuti pärast „vananenud" ja värskenevad fookusel enne 15 minuti aegumist, nagu koerafotod. Puhas loogika on `lib/explore.ts`, `lib/rewards.ts`, `lib/idempotency.ts`, `lib/upload-order.ts` (unit-testid `apps/mobile/test`).

### Kaart ja Avasta

Kaardi vahekaardil on kaks poolt: täisekraankaart ja Avasta voog. Valik on vahekaardi enda olek (`state/explore-view.ts`, `useSyncExternalStore` nagu pargifiltritel), mitte uus ekraan ega route'i parameeter:

- Avasta ülaosas on Figma Segmented Control **Kaart / Avasta**. Kaardil (Figmas seal lülitit pole) viib Avastasse ujuv nupp **„Kogukonna soovitused"** lokaliseerimisnupu kõrval.
- Vahetus ei lisa navigeerimisajalugu: tagasi-žest ei hüppa kaardi ja voo vahel.
- Teised vaated juhivad vahekaarti ühe kutsega: postituse **„Kaardil"** → `focusMap({lat, lng, category})` (kaart avaneb, kaamera liigub kohale, õige kiip valitakse); Poe **„Ava kaart"** → `focusMap({category: 'services'})`; „Soovita kohta" õnnestumine → voog. Fookus on ühekordne (`nonce`), kaart kustutab selle pärast rakendamist, nii et vahekaardile naastes seda ei korrata.

Kaardil tulevad lähimad pargid endiselt `/parks/nearby`-st (koerte arv, filtrid); kõik muu (`kind` `post` / `provider` ja ülejäänud pargid) `GET /map/places`-ist nähtava ala järgi. Ala võrgustatakse 0,02° sammuga väljapoole ja kärbitakse keskpunkti ümber ≤ 1°-ni (`bboxFromRegion`), nii et väike liigutus kasutab vahemälu ja suumitud välja vaade ei anna 400. Päring tehakse alles siis, kui kaamera peatub (`onRegionDidChange`), ja kaart ei sobita end kohtade järgi (see tekitaks tsükli kaamera → ala → kohad → kaamera). Teenuse/kliiniku nööpnõel avab pakkuja kaardi (foto, hinnang, kolm lähimat vaba aega M6-st, käppade soodustus Poe partneritest, Teenused / Broneeri valitud ajaga); postitus avab postituse, park pargi lehe.

### Soovita kohta: asukoht

Väike kaart, mille keskel on liikumatu nööpnõel: kasutaja liigutab kaarti, kuni nõel on koha peal (punkt = kaardi keskpunkt pärast kasutaja liigutust, 5 komakohta). Algpunkt on seadme asukoht; „Kasuta minu asukohta" küsib täpse asukoha (luba vajadusel). Aadress on vaba tekst, mida kaardil näidatakse. **Miks mitte aadressi geokodeerimine:** stack'is pole geokodeerijat (uus teenus, kuhu aadress saadetaks); nõel annab kaardile täpse punkti. Kui asukohaluba pole ja kasutaja kaarti ei liigutanud, ei saa postitada (muidu läheks postitus Tallinna kesklinna). Kaart ise pole VoiceOverile valik — ligipääsetav tee on nupp ja aadressiväli.

Fotod (≤ 5, esimene on kaanepilt, „Tee kaanepildiks") kodeeritakse seadmes ümber nagu M4 (`preparePhoto`: JPEG ≤ 2048 px, ≤ 10 MB), laaditakse **ükshaaval ja kasutaja järjekorras** üles (`POST /me/place-posts/uploads` → PUT allkirjastatud päistega; edenemine „Laen fotot 2/5…") ja postitus saadetakse võtmetega samas järjekorras. Enne üleslaadimist valideeritakse vorm jagatud skeemiga (`createPlacePostInputSchema`), serveri vead näidatakse. Õnnestumisel naaseb kasutaja Avastasse, kus uus postitus on ülal sildiga „Ootab kinnitust".

### Lunastamine ja idempotentsus

Iga „Lunasta" vajutus saab ühe UUID-võtme (`createIdempotencyTracker`): võrguvea või 5xx korral jääb võti alles ja kordus saab sama koodi (punkte ei võeta kaks korda); õnnestumine või 4xx (409 „Käppasid ei ole piisavalt…", juba kasutaja keeles) unustab võtme. UUID tuleb `crypto.getRandomValues`-ist, kui see on olemas, muidu `Math.random`-ist: võti pole saladus ja server seob selle kasutajaga, seepärast uut natiivset krüptomoodulit ei lisatud.

Broneerimisel (`book.tsx`) on partneri juures lüliti **„Kasuta käppi"**: kasutatakse sama pakkuja kasutamata broneeringukoodi või lunastatakse uus vahetult enne broneeringut; kui aeg vahepeal võetakse (409), jääb kood alles ja järgmine katse kasutab seda. Soodushind tuleb serveri vastusest (`discount`), makset pole.

### Teavitused

Teated küsivad nüüd `?include=rewards`; kolm uut tüüpi (`reward_level_up`, `reward_badge`, `place_post_approved`) joonistatakse ja avavad Käpad / postituse, push'i puudutus samuti. Reaalajasündmust neil pole, seega lugemata arvu küsitakse ka ühenduse ajal iga 5 minuti järel ja sokli `unreadCount` asemel värskendatakse arvu päringuga (sokli arv ei sisalda uusi tüüpe). Seaded → Teavitused: lüliti **„Käpad ja märgid"** (`rewards`).

## Ühilduvus praeguse äpiga

- Uued teavitusetüübid ei ole `notificationTypeSchema`-s (community.ts): praegune äpp käib selle läbi `switch`-iga ja ei oskaks uusi ridu joonistada. **Voog ja lugemata arv annavad need ainult `?include=rewards`-iga** ja reaalajasündmust (`notification:new`) nende jaoks ei saadeta. M9b-app lisab tüübid oma vaatesse, hakkab saatma `include=rewards` ja siis saab tüübid ühendada.
- `PUT /me/notification-preferences` võtab `rewards`-i valikuliselt: praegune äpp saadab neli M6 lülitit ja `rewards` jääb muutmata; `GET` tagastab viis.
- `POST /me/bookings` ilma `redemptionId`-ta töötab nagu M6; vastuses on lisaks `discount: null`.

## Privaatsus

- Postitus on avalik sisu (ka sisselogimata vaatajale); autorist näidatakse ainult eesnime (nagu hinnangutes). Fotodelt eemaldatakse EXIF/GPS, toorfail kustutatakse.
- Postituse asukoht on soovitatud **koha** asukoht, mitte kasutaja oma; seda ei seota kasutaja liikumisega.
- Käppade ajalugu, saldo, koodid ja kutsed on ainult `/me` all. Kutsekood ei paljasta kontot: vale või blokeeritud kood on sama `404`.
- Konto kustutamine kustutab kaskaadiga ka kanderaamatu, saldo, koodid, postitused ja meeldimised (päästik lubab kaskaadi).

## Väljaspool skoopi

Admin-vaade ja -endpoint'id (modereerimine, teadete lahendamine, partnerite haldus), partneri koodikontroll (`POST /partner/redemptions/:code/use` oleks järgmine samm: tingimuslik `UPDATE … status = 'used'`), kommentaarid, jalutuskäikude punktid, geotara check-in'il, punktide aegumine, maksed ja kassa, toodete pildid seemnes.

## Testid

- **Unit** (`test/unit/m9b-rules.test.ts`, `m9b-services.test.ts`): Tallinna päevapiir suvel/talvel ja 25-tunnine suveaja lõpu päev, 20 min piir, piirangud (1/park/päev, 3/päev, juba makstu arvestamine), idempotentne ümberarvutus, seeria üle suveaja vahetuse, plaanireeglid (park, aken, liiga lühike, tagantjärele plaan, 1/päev), hinnang/postitus/kutse (10 piir), tasemed (piirid, null, negatiivne, NaN), märkide edenemine; RewardsService (14 päeva aken, taseme/märgi teavitus ainult uutele, kutsuja ümberarvutus, viga ja ajapiirang ainult logitakse, kokkuvõte); PlacePostsService (WebP ümberkodeerimine ja toorfaili kustutamine päris pildiga, võõras võti, mitte-pilt, tagasipööramine, 503, voo parameetrid, 401 sõpradele, 404-d, modereerimine maksab ja teavitab üks kord); ShopService (hind, ümardamine, 409 koos summadega, idempotentne kordus, koodi kokkupõrke kordus, CHECK → 409, aegumine, tühistamine); kutsed; broneeringu soodustus (kasutatud/teine pakkuja/toote kood/aegunud → 409 enne sisestust, võidujooks → 409); Notifier (preferents, pole reaalajasündmust, push-tekstid kolmes keeles); skeemid.
- **HTTP** (`test/http/m9b.routes.test.ts`): kõik marsruudid — edu, 400 (puuduv/`null`/vale tüüp/tundmatu väli/väljaspool Eestit/vigane ID ja kursor/kast), 401 enne valideerimist, 404, 409 tõlgituna, 429 (postitus, teavitus, lunastamine, kutse), 503; pole endpoint'i punktide lisamiseks; `include=rewards`; valikuline `rewards` eelistus.
- **Integratsioon** (`test/integration/explore.flow.test.ts`, päris PostgreSQL/PostGIS + MinIO, eraldi andmebaas): foto üleslaadimine MinIO-sse → WebP ilma EXIF-ita, toorfail kustutatud; ootel postitus nähtav ainult autorile; kaks samaaegset heakskiitu → üks makse ja üks push inglise keeles; opt-in voog; eelistus; kaugus, kategooria, sõbrad; idempotentsed meeldimised ja salvestamised; teavitamine üks kord; kaardi sildid; blokeering mõlemas suunas; **8 samaaegset settle'it maksavad iga sündmuse korra**, piirang 3/päev ja seeria; esimene hinnang üks kord; kutse (liiga vana konto, vale kood, topelt, tasu pärast check-in'i üks kord); **5 samaaegset lunastust ei kuluta üle**; idempotentne kordus; tagasimakse ei tõsta taset; soodustus ühele broneeringule, tühistamine vabastab koodi; kanderaamat on ainult lisamiseks ja saldo ei lähe negatiivseks; kasutajate kustutamine kaskaadib läbi kanderaamatu.

## Mida pole kontrollitud

- Äpi vaateid pole simulaatoris ega seadmes nähtud (arenduskeskkonnas simulaatorit polnud): kontrollitud on `tsc` (ka tüübitud route'idega), lint, unit-testid, `i18n:check`, `a11y:check` ja `expo export` (iOS bundle). Push'e pole seadmes nähtud (Expo-d testides ei kutsuta).
- Inglis- ja venekeelsed tekstid vajavad emakeelse kõneleja ülevaatust.
- Koormust (palju postitusi kaardil) pole mõõdetud; kast ≤ 1° ja 300 kohta hoiavad vastuse piiratud.
