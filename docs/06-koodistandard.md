# 6. Koodistandard ja põhjendused

See dokument selgitab, **miks** kood on paigutatud ja nimetatud nii, nagu ta on. Uus kood järgib samu reegleid; kui reeglist on vaja kõrvale kalduda, kirjuta põhjus koodi kommentaari.

## 6.1 Kaustad

```
apps/api/src
  config/env.ts          Kogu konfiguratsioon, Zod-iga valideeritud
  db/                    schema.ts (tabelid), client.ts (pool), seed.ts (arendusandmed)
  http/                  HTTP-kiht, mis ei sõltu ühestki moodulist
    errors.ts            HttpError ja alamklassid (400, 401, 403, 404, 429, 503)
    error-handler.ts     Iga viga → { error: true, message }
    validate.ts          parseRequest(schema, data, 'body' | 'query' | 'params')
    auth.ts              requireUser() preHandler
  lib/                   Raamistikust sõltumatud abivahendid (withTimeout)
  modules/<valdkond>/    Üks kaust ärivaldkonna kohta
    <valdkond>.routes.ts       HTTP: valideeri → kutsu teenust → vali staatuskood
    <valdkond>.service.ts      Ärireeglid; ei tea HTTP-st ega SQL-ist
    <valdkond>.repository.ts   Ainus koht, kus on SQL / Drizzle / PostGIS
  app.ts                 buildApp(deps, config): rakendus sõltuvustest
  index.ts               Kompositsioonijuur: loob päris andmebaasi ja logija
apps/api/test
  unit/                  Puhtad funktsioonid ja teenused mock'idega
  http/                  Marsruudid app.inject() kaudu, teenus mock'itud
  integration/           Repositooriumid päris PostGIS-i vastu (opt-in)
```

| Otsus | Põhjus |
|---|---|
| **Moodulid valdkonna, mitte tehnilise kihi järgi** (`modules/parks/`, mitte `controllers/`, `services/`) | Ühe funktsiooni muutmine puudutab ühte kausta; uue valdkonna (dogs, visits) lisamine on kausta kopeerimine. |
| **Kolm kihti: routes → service → repository** | Iga kiht on testitav eraldi: teenus mock'itud repositooriumiga, marsruut mock'itud teenusega, repositoorium päris andmebaasiga. |
| **`http/` on moodulitest eraldi** | Veakäsitlus, valideerimine ja autentimine on kõigile moodulitele ühesugused ega tohi sõltuda ühestki valdkonnast. |
| **`app.ts` ja `index.ts` lahus** | `buildApp` ei loo kunagi andmebaasiühendust, seega HTTP-testid ei vaja Postgres't ja käivad alla sekundi. |
| **Zod-skeemid `packages/shared`-is** | Üks definitsioon kehtivast sisendist; äpp ja server ei saa lahku minna. |

## 6.2 Nimed

| Mis | Reegel | Näide | Põhjus |
|---|---|---|---|
| Failid | `kebab-case`, rolli järelliide | `parks.service.ts`, `error-handler.ts` | Failinimest on näha roll; tõstutundlikkuse vead macOS/Linux vahel ei teki. |
| Tehasefunktsioonid | `create<Asi>` | `createParksService`, `createParksRepository` | Sõltuvused antakse argumendina (DI ilma raamistikuta); `new` ja klasse pole vaja. |
| Liidesed | `<Asi>Service`, `<Asi>Repository` | `ParksService` | Testid ja kompositsioonijuur sõltuvad liidesest, mitte teostusest. |
| Teenuse meetodid | Tegevus kasutaja vaatest | `listNearby`, `getPublicPark`, `suggestPark` | `getPublicPark` ütleb, et mitteavalik park annab 404; `suggestPark` ütleb, et park ei ilmu kohe. |
| Repositooriumi meetodid | Andmebaasi vaatest | `findApprovedNearby`, `findById`, `create` | Kirjeldab päringut, mitte ärireeglit. |
| Zod-skeemid | `<asi><Roll>Schema`, tüüp ilma järelliiteta | `createParkInputSchema` → `CreateParkInput` | Skeem ja tüüp on alati paaris ja leitavad. |
| Andmebaas | `snake_case` tabelid ja veerud, mitmus | `check_ins.expires_at` | Postgres'i konventsioon; Drizzle kaardistab camelCase'i. Erand: Better Authi tabelid (`user`, `session`) on tema nõutud nimedega. |
| URL-id | `/api/v1/<mitmus>/<:id>` | `/api/v1/parks/:parkId` | Versioon lubab vanadel äpiversioonidel töötada, kui v2 tuleb. `/health` on väljaspool, sest seda kasutavad koormusjaoturid. |

## 6.3 Vigade leping

Iga vastus, mis ei ole 2xx, on täpselt kujul:

```json
{ "error": true, "message": "Inimloetav eestikeelne tekst" }
```

`message` on alati kasutajale näitamiseks ohutu (UI on eestikeelne, seega ka tekst). Sisemised detailid (SQL, stack trace, failiteed) logitakse serverisse ega jõua kunagi kliendini.

| Olukord | Staatus | Näide |
|---|---|---|
| Päringu sisu puudub, on `null` või tühi | 400 | `Päringu sisu puudub` |
| Vigane JSON | 400 | `Päringu sisu ei ole korrektne JSON` |
| Vale väli või tüüp, `null` kohustuslikus väljas | 400 | `Väli "lat" puudub või on vale tüüpi` |
| ID ei ole UUID | 400 | `Väli "parkId" on vales vormingus` |
| Tundmatud väljad (nt `status`) | 400 | `Tundmatud väljad: status` |
| Pole sisse logitud | 401 | `Palun logi sisse` |
| Ei leitud (ka mitteavalik) | 404 | `Parki ei leitud` |
| Sisu liiga suur (> 64 KB) | 413 | `Päringu sisu on liiga suur` |
| Ei ole JSON | 415 | `Toetatud on ainult application/json` |
| Liiga palju päringuid | 429 | `Liiga palju päringuid, proovi hetke pärast uuesti` |
| Andmebaas aeglane või kättesaamatu | 503 | `Teenus ei vasta, proovi hetke pärast uuesti` |
| Ootamatu viga | 500 | `Serveri viga, proovi hiljem uuesti` |

Kuidas lisada: viska teenuses või marsruudis `HttpError` alamklass (`throw new NotFoundError('Koera ei leitud')`). Ära kasuta `reply.code(...).send({...})` vigade jaoks.

## 6.4 Valideerimine ja turvalisus

- **Iga sisend läbib `parseRequest`-i** enne kasutamist: body, query ja params. Marsruut ei loe `request.body` otse.
- **Body-skeemid on `.strict()`.** Tundmatud väljad lükatakse tagasi, seega klient ei saa seada serveri välju (`status`, `createdBy`). See kaitseb mass assignment'i eest.
- **Body tüüpe ei teisendata.** `"59.4"` ei ole number. Query ja params teisendatakse, sest URL kannab ainult teksti.
- **Igal stringil on maksimumpikkus**, valikuline tekst trimmitakse ja `""` muutub `null`-iks.
- **Autentimine on vaikimisi suletud.** Kuni Better Auth on ühendatud (M1), vastab iga kaitstud marsruut 401.
- **Mitteavalik ressurss annab 404, mitte 403**, et API ei paljastaks, et selline ID olemas on.
- **Ajapiirangud:** `statement_timeout` (5 s) Postgres'is, `withTimeout` (8 s) teenuses, `requestTimeout` (15 s) Fastifys, `connectionTimeoutMillis` (3 s) pool'is.
- **Piirangud:** globaalne rate limit 120 päringut minutis IP kohta, kirjutavatel marsruutidel rangem (pargi lisamine 10 tunnis); body max 64 KB, sest pildid ei käi läbi API.
- **Päised:** `@fastify/helmet`. CORS keelab brauserid, kui `CORS_ORIGINS` pole seatud (natiivne äpp CORS-i ei kasuta).
- **Logid** ei sisalda `Authorization` ega cookie päiseid.
- **SQL** ainult Drizzle'i või parameetritega `sql`-mallide kaudu, mitte kunagi stringide liitmisega.

## 6.5 Testid

| Kiht | Kaust | Mida kontrollitakse | Sõltuvused |
|---|---|---|---|
| Unit | `test/unit` | Teenuse reeglid, ajapiirangud (vale-taimeritega), valideerimise tekstid, vigade kaardistus | Repositoorium mock'itud (`vi.fn`) |
| HTTP | `test/http` | Staatuskoodid, veaformaat, puuduv/vigane/`null` sisu, vigased ID-d, 401/404/413/415/429/503/500 | Teenus mock'itud, andmebaasi pole |
| Integratsioon | `test/integration` | Päris SQL ja PostGIS (kaugus, staatusefilter, `null` tulemus) | Docker Postgres (`npm run test:integration`) |

Raamistik on **Vitest** (Jestiga sama API: `describe`, `it`, `expect`, `vi.fn`). See töötab ESM-i ja TypeScriptiga ilma lisaseadistuseta. Igal uuel marsruudil peab olema vähemalt: edukas juhtum, puuduv sisu, vigane tüüp, `null` kohustuslikus väljas, vigane ID, autentimata päring (kui kaitstud) ja teenuse timeout → 503.
