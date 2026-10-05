# 9. Kohalolek ja külastused (M3)

## Mis on valmis

| Funktsioon | API | Äpp |
|---|---|---|
| Minu koerad (põhiandmed) | `GET/POST /me/dogs`, `PATCH/DELETE /me/dogs/:dogId` | `dogs/index`, `dogs/edit` (lisamine ja muutmine samas vormis, kustutamine kinnitusega) |
| Märgi kohalolek | `POST /me/check-ins`, `GET /me/check-ins/active`, `POST /me/check-ins/:id/end` | `check-in` modaal; pargi lehel „Oled pargis kuni …" ja „Lõpeta külastus"; avalehel aktiivne külastus |
| Kes on pargis | `GET /parks/:parkId/visitors` | Pargi lehel „Praegu pargis" + varjatud koerte arv |
| Külastuste ajalugu | `GET /me/visits` | `visits` (kestus, koerad, „Lisa hinnang") |
| Külastuse planeerimine | `POST/GET /me/planned-visits`, `DELETE /me/planned-visits/:planId` | `plan-visit` modaal (päev, kellaaeg, kestus, sõnum); plaanid avalehel ja külastuste vaates |
| Hinnangud | `GET /parks/:parkId/reviews`, `PUT /parks/:parkId/reviews/mine` | Pargi lehel 3 viimast; `review` modaal (1–5 tärni, tekst) |
| Ohuteated | `POST /parks/:parkId/reports` | `report` modaal |

Koerte põhiandmed toodi M4-st ettepoole, sest kohalolek eeldab koera valimist. Fotod ja terviseandmed jäävad M4-sse.

## Reeglid ja põhjused

**Kohalolek**
- Kohalolek on alati ajaliselt piiratud (15–180 min, vaikimisi 60) ja aegub lugemise hetkel (`expires_at > now()`). Seetõttu **ei ole vaja eraldi taustatööd ega Redist**. BullMQ jääb M5 teavituste jaoks; plaanist on see teadlik kõrvalekalle.
- Ühel kasutajal saab olla **üks avatud kohalolek**. Uus check-in sulgeb eelmise samas transaktsioonis (aegunud suletakse aegumise hetkega, mitte „praegu"). Osaline unikaalne indeks `check_ins_one_open_per_user_uq` tagab sama ka samaaegsete päringute korral: teine saab vastuseks `409`.
- Kohalolekut saab märkida ainult **oma koertega** (võõra koera ID → `404`, et ei saaks teiste koerte ID-sid kinnitada).
- „Lõpeta külastus" on idempotentne: juba lõppenud külastuse lõpetamine on `204`, võõras on `404`.

**Kes on pargis** (privaatsus)
- Nimekiri on nähtav ainult sisselogitud kasutajale.
- Inimene on nähtav, kui (a) see oled sina, või (b) tema seade on „kõigile", või (c) „sõpradele" ja te olete kinnitatud sõbrad — **ja** kumbki pole teist blokeerinud.
- Varjatud inimeste koerad loetakse arvu sisse („+ 1 koer, kelle omanik ei jaga oma kohalolekut"), nime ega tõugu ei näidata.
- Näidatakse ainult eesnime.
- Reegel on SQL-is, seega varjatud inimeste andmed ei lahku andmebaasist.

**Hinnangud ja teated**
- Hinnata saab ainult parki, kus oled kohalolekut märkinud (`403`), et keegi ei saaks hinnata parke, kus ta pole käinud.
- Üks hinnang kasutaja ja pargi kohta (unikaalne indeks). `PUT …/reviews/mine` asendab varasema, seega on topeltsaatmine ohutu.
- Ohuteade nõuab sisselogimist, vähemalt 10 märki ja on piiratud 5 teatega tunnis (iga teade on käsitsi modereerimise töö).

**Planeerimine**
- Algus ei tohi olla minevikus (5 min kellaaja nihke varu), kuni 30 päeva ette, kestus kuni 4 tundi.
- Äpis valitakse päev, kellaaeg ja kestus nuppudega, mitte kuupäevavalijaga: plaan on „homme kell 17", mitte minutitäpsusega.

## Testid

- **API:** 186 unit/HTTP testi (skeemid, teenused mock'itud repositooriumidega, kõik marsruudid sh 401/400/403/404/409/503) ja 31 integratsioonitesti. Täisvoog `visits.flow.test.ts`: koer, võõra koeraga check-in, hinnang enne külastust, privaatsusreeglid nelja kasutajaga, uus check-in sulgeb eelmise, idempotentne lõpetamine, hinnangu asendamine, plaanid, teade, kustutamine.
- **Simulaator:** avaleht aktiivse külastuse ja plaaniga, pargi leht („Oled pargis kuni …", 3 koera, hinnang), külastuste ja koerte vaade, check-in ja planeerimise modaalid. Selleks kasutati ajutist, commit'imata koodimuudatust, mis lisas demo-kasutaja sessiooni (simulaatoris ei saa parooli sisestada).

## Teadaolevad piirangud

- Vajutusi (check-in nupp, tärnid, „Lõpeta külastus") ei saanud simulaatoris automaatselt proovida. API on testitud, UI tuleb läbi klõpsata.
- ~~Sõprade plaane avalehel veel ei näidata.~~ M5: avalehel on sõprade plaanid 48 h ette, külastajate realt avaneb profiil (vt [12-kogukond.md](12-kogukond.md)).
- Teadete modereerimiseks pole veel adminivaadet.
- Arendusandmebaasis on demo-kasutaja `demo@kapp.test.invalid` (parool `pikk-parool-123`) koos koera, külastuse ja plaaniga.
