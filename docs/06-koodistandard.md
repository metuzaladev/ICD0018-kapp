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
  storage/               Objektihoidla: ObjectStorage liides ja S3 teostus (MinIO / R2)
  modules/<valdkond>/    Üks kaust ärivaldkonna kohta
    <valdkond>.routes.ts       HTTP: valideeri → kutsu teenust → vali staatuskood
    <valdkond>.service.ts      Ärireeglid; ei tea HTTP-st ega SQL-ist
    <valdkond>.repository.ts   Ainus koht, kus on SQL / Drizzle / PostGIS
  app.ts                 buildApp(deps, config): rakendus sõltuvustest
  services.ts            createServices(db, storage): sama objektigraaf serverile ja integratsioonitestidele
  index.ts               Kompositsioonijuur: loob päris andmebaasi, hoidla ja logija
apps/api/test
  unit/                  Puhtad funktsioonid ja teenused mock'idega
  http/                  Marsruudid app.inject() kaudu, teenus mock'itud
  integration/           Repositooriumid päris PostGIS-i (ja MinIO) vastu (opt-in)
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
{ "error": true, "message": "Inimloetav tekst kasutaja keeles" }
```

`message` on alati kasutajale näitamiseks ohutu ja päringu `Accept-Language` keeles (vaikimisi eesti, lisaks inglise ja vene; vt [11-tolked-ja-figma.md](11-tolked-ja-figma.md#api-veateated)). Tabelis on eestikeelsed tekstid. Sisemised detailid (SQL, stack trace, failiteed) logitakse serverisse (inglise keeles) ega jõua kunagi kliendini.

| Olukord | Staatus | Näide |
|---|---|---|
| Päringu sisu puudub, on `null` või tühi | 400 | `Päringu sisu puudub` |
| Vigane JSON | 400 | `Päringu sisu ei ole korrektne JSON` |
| Vale väli või tüüp, `null` kohustuslikus väljas | 400 | `Väli "lat" puudub või on vale tüüpi` |
| ID ei ole UUID | 400 | `Väli "parkId" on vales vormingus` |
| Tundmatud väljad (nt `status`) | 400 | `Tundmatud väljad: status` |
| Pole sisse logitud | 401 | `Palun logi sisse` |
| Pole lubatud (nt hinnang ilma külastuseta) | 403 | `Hinnata saab parki, mida oled külastanud` |
| Ei leitud (ka mitteavalik) | 404 | `Parki ei leitud` |
| Vastuolu hetkeolukorraga (samaaegne check-in, koerte limiit) | 409 | `Kohalolek on juba märgitud, värskenda vaadet` |
| Sisu liiga suur (> 64 KB) | 413 | `Päringu sisu on liiga suur` |
| Ei ole JSON | 415 | `Toetatud on ainult application/json` |
| Liiga palju päringuid | 429 | `Liiga palju päringuid, proovi hetke pärast uuesti` |
| Andmebaas aeglane või kättesaamatu | 503 | `Teenus ei vasta, proovi hetke pärast uuesti` |
| Objektihoidla viga (võrk, võtmed, 5xx) | 503 | `Pildihoidla ei vasta, proovi hetke pärast uuesti` |
| Üles laaditud fail ei ole sisu järgi pilt / on üle 10 MB | 400 | `Faili ei saanud pildina lugeda, proovi JPEG- või PNG-pildiga` / `Pilt võib olla kuni 10 MB` |
| Ootamatu viga | 500 | `Serveri viga, proovi hiljem uuesti` |

Sama kehtib `/api/v1/auth/*` kohta: Better Authi vastused `{ code, message }` tõlgitakse failis `modules/auth/auth-errors.ts`.

Kuidas lisada: lisa teate võti kolme faili `packages/shared/src/i18n/{et,en,ru}.ts` ja viska teenuses või marsruudis `HttpError` alamklass võtmega (`throw new NotFoundError('errors.dogNotFound')`, parameetritega `new ConflictError('errors.dogLimit', { max: 10 })`). Veakäsitleja tõlgib selle päringu keelde. Ära kasuta `reply.code(...).send({...})` vigade jaoks ega kirjuta teenusesse valmis teksti.

## 6.4 Valideerimine ja turvalisus

- **Iga sisend läbib `parseRequest`-i** enne kasutamist: body, query ja params. Marsruut ei loe `request.body` otse.
- **Body-skeemid on `.strict()`.** Tundmatud väljad lükatakse tagasi, seega klient ei saa seada serveri välju (`status`, `createdBy`). See kaitseb mass assignment'i eest.
- **Body tüüpe ei teisendata.** `"59.4"` ei ole number. Query ja params teisendatakse, sest URL kannab ainult teksti.
- **Igal stringil on maksimumpikkus**, valikuline tekst trimmitakse ja `""` muutub `null`-iks.
- **Autentimine on vaikimisi suletud.** `requireUser` vastab 401 enne valideerimist, seega anonüümne klient ei saa skeemi kohta midagi teada. Sessiooni andmebaasi viga annab 503, mitte eksitava 401.
- **„Mina" endpoint'id kasutavad `/me`, mitte `/users/:id`**, seega ei saa klient adresseerida teise kasutaja andmeid.
- **Mitteavalik ressurss annab 404, mitte 403**, et API ei paljastaks, et selline ID olemas on.
- **Ajapiirangud:** `statement_timeout` (5 s) Postgres'is, `withTimeout` (8 s) teenuses, `requestTimeout` (15 s) Fastifys, `connectionTimeoutMillis` (3 s) pool'is.
- **Piirangud:** globaalne rate limit 120 päringut minutis IP kohta, kirjutavatel marsruutidel rangem (pargi lisamine 10 tunnis); body max 64 KB, sest pildid ei käi läbi API.
- **Päised:** `@fastify/helmet`. CORS keelab brauserid, kui `CORS_ORIGINS` pole seatud (natiivne äpp CORS-i ei kasuta).
- **Logid** ei sisalda `Authorization` ega cookie päiseid.
- **SQL** ainult Drizzle'i või parameetritega `sql`-mallide kaudu, mitte kunagi stringide liitmisega.
- **Korrelatsiooniga alampäringus viita välisele reale selgesõnaliselt** (`"parks"."id"`). Drizzle kirjutab ühe tabeli päringus `${parks.id}` kujul `"id"` ja alampäringus seob Postgres selle sisemise tabeliga, mis annab vaikselt vale tulemuse (vt docs/08).
- **Idempotentsed muutused on `PUT`/`DELETE`** (nt lemmikud, `PUT …/reviews/mine`), et korduspäringud oleksid ohutud.
- **Ärireeglid, mis peavad kehtima ka samaaegsete päringute korral, on andmebaasis** (unikaalsed/osalised indeksid, CHECK). Teenus kontrollib neid ka ise sõbraliku veateate jaoks ja tõlgib unikaalsusrikkumise (`isUniqueViolation`) koodiks 409.
- **Võõra ressursi ID annab 404, mitte 403** (koerad, kohalolekud, plaanid, fotod, tervisekirjed), et ID-de olemasolu ei saaks kinnitada.
- **Failid ei käi läbi API.** Klient saab allkirjastatud PUT-URL-i (tüüp ja suurus on allkirjas), server kontrollib hiljem, et võti on kasutaja oma (`uploads/<userId>/…`, muidu 404), ja usaldab ainult faili **sisu**, mitte `Content-Type`'i. Pildid kodeeritakse ümber, mis eemaldab EXIF-i (sh GPS). Bucket on privaatne, välja antakse ainult lühiajalised allkirjastatud URL-id.
- **Andmebaas + hoidla:** objektid kirjutatakse enne rida ja ebaõnnestumisel kustutatakse (poolikut rida ei teki); kustutamisel rida enne, objektid pärast (parima tahte järgi — orvuks jäänud privaatne objekt maksab ainult ruumi, ülestõusnud rida oleks viga).

## 6.5 Testid

| Kiht | Kaust | Mida kontrollitakse | Sõltuvused |
|---|---|---|---|
| Unit | `test/unit` | Teenuse reeglid, ajapiirangud (vale-taimeritega), valideerimise tekstid, vigade kaardistus | Repositoorium mock'itud (`vi.fn`) |
| HTTP | `test/http` | Staatuskoodid, veaformaat, puuduv/vigane/`null` sisu, vigased ID-d, 401/404/413/415/429/503/500 | Teenus mock'itud, andmebaasi pole |
| Integratsioon | `test/integration` | Päris SQL ja PostGIS (kaugus, staatusefilter, `null` tulemus) | Docker Postgres (`npm run test:integration`) |

Raamistik on **Vitest** (Jestiga sama API: `describe`, `it`, `expect`, `vi.fn`). See töötab ESM-i ja TypeScriptiga ilma lisaseadistuseta. Igal uuel marsruudil peab olema vähemalt: edukas juhtum, puuduv sisu, vigane tüüp, `null` kohustuslikus väljas, vigane ID, autentimata päring (kui kaitstud) ja teenuse timeout → 503.
