# 15. Pakendamine ja levitamine (M8)

Kuidas Käpp jõuab testijateni (TestFlight, Google Play internal testing) ja kuidas API töötab toodangus EL-is. Repositooriumis on kogu seadistus olemas; kontode loomine, võtmed ja esimene väljalase on käsitsi sammud (vt [15.9](#159-käsitsi-sammud-samm-sammult)).

| Mis | Kus | Seis |
|---|---|---|
| EAS Build profiilid, kanalid, versioonid | `apps/mobile/eas.json`, `apps/mobile/app.json` | ✅ valmis, käivitamata (vajab Expo kontot) |
| Väljalaske kontroll (API URL, projectId) | `apps/mobile/app.config.ts` | ✅ testitud (`test/release-config.test.ts`) |
| iOS privaatsusmanifest, lubade tekstid et/en/ru, Androidi load | `app.json`, `src/i18n/native/*.json` | ✅ `npx expo config` kontrollitud, natiivselt ehitamata |
| API Docker image | `apps/api/Dockerfile`, `.dockerignore` | ✅ ehitatud ja käivitatud lokaalselt ja CI-s |
| Migratsioonid eraldi sammuna | `apps/api/src/db/migrate.ts` → `node dist/migrate.js` | ✅ testitud |
| Toodangu konfiguratsiooni kontroll | `apps/api/src/config/env.ts` | ✅ testitud |
| Mitu API instantsi (Redis) | `RATE_LIMIT_STORE`, `REALTIME_ADAPTER` | ✅ integratsioonitestid |
| Graatsiline seiskamine | `apps/api/src/lib/graceful-shutdown.ts` | ✅ testitud, `docker stop` kontrollitud |
| CI: image ehitus + suitsutest | `.github/workflows/ci.yml` (job `docker`) | ✅ |
| Käsitsi väljalaske mallid | `.github/workflows/release-api.yml`, `release-mobile.yml` | ✅ mallid, käivitamata |
| Näide ühe VM-i jaoks | `docker-compose.prod.yml` + `apps/api/.env.production.example` | ✅ `docker compose config` kontrollitud |
| Konto kustutamine, privaatsuspoliitika/tingimused, e-post (M10) | docs/17 | ✅ testitud; vastutava töötleja andmed ja e-posti võtmed käsitsi |

## 15.1 Hostimine EL-is — soovitus

Kõik kasutajaandmed (kontod, koerad, tervisekirjed, sõnumid, asukohaga seotud kohalolek, fotod) peavad jääma EL-i. Soovitus kursuseprojekti mahule ja eelarvele (hinnad on suunavad, kontrolli enne tellimist):

| Osa | Soovitus | Miks | Alternatiivid |
|---|---|---|---|
| **API** | **Hetzner Cloud** VM (Saksamaa või Soome, nt CX22/CAX11, ~4–6 €/kuu) + `docker-compose.prod.yml` (API + Redis + Caddy TLS) | Euroopa ettevõte ja andmekeskus, odav, täielik kontroll; Docker image on sama, mis CI-s testitud. Üks VM kannab kursuse koormuse kergelt. | **Scaleway** Serverless Containers (Pariis/Amsterdam, Prantsuse ettevõte), **Render** (Frankfurt), **Fly.io** (`fra`/`arn`). Render ja Fly on USA ettevõtted EL-i regiooniga: andmed EL-is, aga lisaks on vaja nende DPA-d ja SCC-sid. |
| **Postgres 17 + PostGIS** | **Scaleway Managed PostgreSQL** või **Aiven** (Soome ettevõte) EL-i regioonis | Hallatud varukoopiad ja PITR, uuendused, PostGIS-i tugi. Hetzneril hallatud Postgres't pole. | Supabase / Neon Frankfurdis (USA ettevõtted), või Postgres samal VM-il (siis varukoopiad on täielikult sinu vastutus, vt 15.5). |
| **Redis** | Samal VM-il (`docker-compose.prod.yml`, AOF + `noeviction`) | Järjekorra tööd ja limiidiloendurid; ühe instantsi puhul pole hallatud teenust vaja. | Mitme VM-i korral hallatud Redis EL-is (Aiven for Valkey, Scaleway Managed Redis). **Upstash** pole BullMQ jaoks hea valik: töötajad küsivad pidevalt ja hinnastus on käsupõhine. |
| **Fotod** | **Cloudflare R2**, bucket **EU jurisdiction**'iga (lõpp-punkt `https://<konto>.eu.r2.cloudflarestorage.com`) | S3 API (kood juba töötab MinIO-ga), väljaminev liiklus tasuta, jurisdiktsiooniga bucket hoiab andmed EL-is. | Scaleway Object Storage, Hetzner Object Storage (mõlemad EL-i ettevõtted, S3 API). |
| **TLS/domeen** | Caddy samas compose'is (automaatne Let's Encrypt) | Null seadistust, sertifikaadid uuenevad ise. | Platvormi enda TLS (Render/Fly/Scaleway). |

Miks mitte kohe Kubernetes vms: üks arendaja, kursuse koormus ja selge väljalaskeprotsess on olulisemad kui automaatne skaleerimine. Kood on mitme instantsi jaoks siiski valmis (15.4).

## 15.2 GDPR ja privaatsus

- **Andmete asukoht:** API, andmebaas, Redis ja fotod EL-is (15.1). Iga teenusepakkujaga sõlmi DPA (andmetöötlusleping); EL-välise ettevõtte puhul (Cloudflare, Render, Fly) kontrolli SCC/DPF katet.
- **Andmed, mis lahkuvad EL-ist:**
  - **Push-teavitused** käivad läbi Expo push-teenuse (USA) ning Apple APNs / Google FCM. Push sisaldab saatja nime ja kuni 120-märgilist sõnumi eelvaadet (`push-messages.ts`). Kirjelda seda privaatsuspoliitikas; vajadusel muuda sõnumi-push sisutuks („Uus sõnum").
  - **EAS Build** (USA) näeb ainult lähtekoodi ja ehitusmuutujaid, mitte kasutajaandmeid. Sinna ei panda saladusi peale `EXPO_PUBLIC_*` (need on niikuinii äpis avalikud).
  - **Kaardiplaadid** (OpenFreeMap) — seade laeb plaate otse; teenus näeb seadme IP-d ja vaadatavat piirkonda.
- **Logid ilma isikuandmeteta:** päringulogis on ainult meetod, tee ja marsruut — ei query stringi (koordinaadid, otsingusõnad) ega IP-d (`lib/log-serializers.ts`); `Authorization`/cookie päised on peidetud; e-posti töötaja ja kustutamise auditirida logivad ainult ID-sid ja arve, mitte aadresse (docs/17). Hoia logisid 14–30 päeva.
- **Säilitamine:** kohalolek aegub ise (docs/09); koerad, tervisekirjed, fotod ja ajalugu säilivad konto kustutamiseni; saadetud sõnumid jäävad vestluskaaslasele anonüümselt kuni tema konto kustutamiseni. Varukoopiad aeguvad 30 päevaga, seega kustutatud andmed kaovad ka varukoopiatest hiljemalt 30 päeva pärast. Kõik see on privaatsuspoliitikas (docs/17).
- **Kustutamine (M10):** Seaded → Konto → „Kustuta konto" (`DELETE /api/v1/me`, taas-autentimine, üks transaktsioon, failid R2-st BullMQ tööga pärast commit'i). Google Play nõuab lisaks veebilinki: privaatsuspoliitika URL (p 8). Vt docs/17.
- **E-post (M10):** `MAIL_PROVIDER=smtp|resend` (toodangus kohustuslik), järjekord BullMQ-s, kordused ja idempotentsus. Saatja domeenile SPF + DKIM (+ DMARC). Vt docs/17.
- **Privaatsuspoliitika ja tingimused (M10):** `https://api.<domeen>/legal/privacy` ja `/legal/terms` (et/en/ru); äpis Seaded → „Privaatsus ja tingimused". Enne avaldamist täida vastutav töötleja (docs/17 p 17.5).
- **Privaatsuspoliitika ja poe vormid:** Apple'i „App Privacy" (nutrition label) ja Google'i „Data safety" peavad ühtima `app.json` → `ios.privacyManifests.NSPrivacyCollectedDataTypes`-iga: nimi, e-post, kasutaja ID, seadme ID (push-märk), ligikaudne asukoht (kohalolek pargis), fotod, sõnumid, muu kasutaja sisu (bio, hinnangud); kõik „seotud kasutajaga", eesmärk „rakenduse funktsionaalsus", **jälgimist pole** (`NSPrivacyTracking: false`). Seadme täpset asukohta ei salvestata: lähimate parkide päring kasutab seda ainult päringu ajal.

## 15.3 Keskkonnamuutujad

### API (`apps/api/src/config/env.ts`)

Toodangus (`NODE_ENV=production`) keeldub API käivitumast, kui kohustuslik väärtus puudub, on tühi või on arenduse vaikeväärtus, ja loetleb kõik vead korraga. Mall: `apps/api/.env.production.example`.

| Muutuja | Toodangus | Vaikimisi | Tähendus |
|---|---|---|---|
| `NODE_ENV` | `production` | `development` | Lülitab sisse kontrollid, Secure küpsised, info-taseme logid |
| `PORT`, `HOST` | – | `3000`, `0.0.0.0` | |
| `DATABASE_URL` | **kohustuslik** | localhost | Hallatud Postgres + PostGIS, soovitavalt `?sslmode=require` |
| `REDIS_URL` | **kohustuslik** | localhost | BullMQ järjekorrad, jagatud limiidid, Socket.IO adapter |
| `API_PUBLIC_URL` | **kohustuslik, https** | `http://localhost:3000` | Parooli taastamise ja OAuth lingid |
| `BETTER_AUTH_SECRET` | **kohustuslik**, ≥ 32 märki, mitte arenduse oma | arenduse saladus | `openssl rand -base64 32`; vahetamine logib kõik välja |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | **kohustuslikud** (saladus ei tohi olla MinIO oma) | MinIO | R2: `https://<konto>.eu.r2.cloudflarestorage.com`, `S3_REGION=auto` |
| `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` | – | | docs/10 |
| `CORS_ORIGINS` | ainult `https://` päritolud, mitte `*` | tühi (brauserid keelatud) | Natiivne äpp CORS-i ei vaja |
| `TRUST_PROXY` | proksite arv (`1`) või nende CIDR-id | `false` | `true` lubatakse hoiatusega: siis saab otse serverini jõudev klient oma IP-d võltsida |
| `RATE_LIMIT_MAX` | – | `120` | Päringut minutis IP kohta |
| `RATE_LIMIT_STORE` | `redis`, kui instantse on > 1 | `memory` | 15.4 |
| `REALTIME_ADAPTER` | `redis`, kui instantse on > 1 | `memory` | 15.4 |
| `PUSH_WORKER_ENABLED` | `false` API instantsidel, kui eraldi töötaja | `true` | 15.4; kõik BullMQ töötajad (push, meeldetuletused, e-post, failide koristus) |
| `PUSH_QUEUE_PREFIX` | eri keskkondadel eri väärtus, kui Redis on jagatud | `kapp` | Ka Socket.IO kanali eesliide |
| `EXPO_ACCESS_TOKEN` | kui Expo „enhanced push security" on sees | – | |
| `APPLE_*`, `GOOGLE_*` | valikulised | – | docs/07 |
| `MAIL_PROVIDER` | **`smtp` või `resend`** (`log` keelatud) | `log` | E-posti transport (docs/17) |
| `MAIL_FROM` | **kohustuslik** | arenduses `Käpp <noreply@localhost>` | Saatja; domeenil SPF + DKIM |
| `SMTP_URL` | kui `MAIL_PROVIDER=smtp` | – | `smtps://kasutaja:parool@host:465` (saladus) |
| `RESEND_API_KEY` | kui `MAIL_PROVIDER=resend` | – | Resendi saatmisvõti (saladus); domeen EL-i piirkonnas |
| `SHUTDOWN_TIMEOUT_MS` | alla platvormi seiskamisaja | `9000` | Docker annab 10 s, Fly `kill_timeout`, Render 30 s |
| `LOG_LEVEL` | – | `info` (toodang) / `debug` | pino tase |
| `DB_STATEMENT_TIMEOUT_MS`, `SERVICE_TIMEOUT_MS`, `BODY_LIMIT_BYTES` | – | 5000, 8000, 64 KB | docs/06 |

### Äpp (EAS environment variables)

`EXPO_PUBLIC_*` väärtused kirjutatakse ehitamisel JavaScripti sisse ja on äpist loetavad — **saladusi siia ei panda**. Need hoitakse EAS-i keskkondades (`development`, `preview`, `production`), mida `eas.json` profiilid `environment` võtmega kasutavad; sama keskkond antakse `eas update --environment`-iga, nii et build ja OTA-uuendus näevad samu väärtusi.

| Muutuja | preview | production | Tähendus |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://api-staging.<domeen>` | `https://api.<domeen>` | API päritolu ilma teeta. `app.config.ts` katkestab preview/production ehituse, kui see puudub, pole https või on kohalik aadress. |
| `EXPO_PUBLIC_AUTH_APPLE` | `true`/`false` | `true`/`false` | Näita Apple'i nuppu ainult siis, kui API-l on võtmed |
| `EXPO_PUBLIC_AUTH_GOOGLE` | `true`/`false` | `true`/`false` | Sama Google'i kohta |

## 15.4 API konteiner ja otsused

```bash
docker build -f apps/api/Dockerfile -t kapp-api .            # repo juurest (vajab packages/shared)
docker run --rm --env-file api.env kapp-api node dist/migrate.js   # kord väljalaske kohta
docker run -p 3000:3000 --env-file api.env kapp-api           # server, healthcheck /health
```

| Otsus | Põhjus |
|---|---|
| **esbuild-bundle (`scripts/build.mjs`), mitte `tsc` ega tsx toodangus** | Kood kasutab laiendita importe (`moduleResolution: Bundler`) ja `@kapp/shared` on TypeScripti lähtekood — `tsc` väljund ei jookseks Node'is. tsx tooks kompilaatori runtime image'isse ja kompileeriks iga käivitusega. Bundle sisaldab ainult meie koodi ja `@kapp/shared`-i; npm-paketid jäävad väliseks ja paigaldatakse `npm ci --omit=dev`-ga konteineri platvormile (sharp vajab õiget natiivset binaari). Tüübid kontrollib CI eraldi. |
| **`node:24-bookworm-slim`, mitte alpine ega distroless** | sharp'il on valmis glibc binaarid (alpine/musl vajaks teist), slim jätab shelli `docker exec` silumiseks. Runtime'ist on eemaldatud npm/corepack, protsess jookseb kasutajana `node`, failid kuuluvad root'ile (API ei kirjuta kettale, sobib `read_only: true`-ga). |
| **Sõltuvuste kärpimine (`scripts/prune-runtime-deps.mjs`)** | `--omit=dev` jätab alles better-auth'i *valikulised peer*-sõltuvused (drizzle-kit, vitest, typescript…), sest monorepos on need dev-sõltuvused ja lukufail märgib need `devOptional`-iks; lisaks paigaldab jagatud lukufail Expo äpi pakette (lightningcss). Skript käib API sõltuvusgraafi läbi Node'i lahendusreeglitega ja kustutab kõik, mida API ei laadi: node_modules 273 MB → ~150 MB. CI käivitab image'i ja kontrollib `/health`, nii et liiga palju kustutamine ei jääks märkamata. |
| **Migratsioon eraldi käsuna, mitte iga käivitusega** | Mitu instantsi või rolling deploy hakkaksid sama baasi korraga migreerima; ebaõnnestunud migratsioon paneks kõik instantsid crash-loop'i, selle asemel et üks nähtav väljalaskesamm ebaõnnestuks; runtime'i andmebaasikasutaja ei vaja DDL-õigusi. `migrate.js` kasutab drizzle-orm'i migraatorit (sama `drizzle.__drizzle_migrations` tabel nagu drizzle-kit arenduses) ilma 5 s `statement_timeout`-ita. Platvormil: Render „Pre-deploy command", Fly `release_command`, compose'is `docker compose run --rm migrate`. |
| **Healthcheck `/health` = elus, mitte „valmis"** | Vastab 200 seni, kuni protsess teenindab HTTP-d; andmebaasi seis on kehas (`"database":"up"/"down"`). Andmebaasi katkestus ei pane platvormi terveid konteinereid taaskäivitama (see ei aitaks); jälgi `database` välja eraldi häirega (15.6). Logitakse ainult `warn` tasemel, et iga 15 s kontroll logi ei täidaks. |
| **Graatsiline seiskamine** | SIGTERM → HTTP ja socketid suletakse (pooleli päringud lõpetatakse), siis BullMQ töötajad (pooleli töö lõpetatakse, lõpetamata jäävad Redisesse), järjekorrad, Redis, andmebaas. Üks ebaõnnestunud samm ei jäta teisi vahele, kõigel on ühine tähtaeg (`SHUTDOWN_TIMEOUT_MS`), korduv signaal ignoreeritakse. **Leitud viga:** avatud WebSocket hoidis HTTP-serveri lahti ja seiskamine rippus tähtajani — socketid suletakse nüüd `preClose` konksus (test `test/http/m8.routes.test.ts`). |

### Mitu instantsi

Üks instants ei vaja midagi. Kui käivitad mitu (või rolling deploy hoiab korraks kaht):

| Mure | Lahendus | Kui Redis on maas |
|---|---|---|
| Iga instants loeks limiite eraldi (N × limiit) | `RATE_LIMIT_STORE=redis` — loendurid Redises (`kapp:rate-limit:*`) | Limiit lülitub välja (fail open, `skipOnError`): kuritarvitamise kaitse ei tohi kogu API-d maha võtta. Kiire katkestus: 500 ms käsu ajapiir, ühendus 2 s. |
| Socket.IO emit jõuaks ainult samasse instantsi ühendatud kasutajateni | `REALTIME_ADAPTER=redis` — `@socket.io/redis-adapter` (pub/sub) | Emitid puhverdatakse ja saadetakse pärast taasühendust; äpi 15 s polling katab vahepealse (docs/12). |
| Push-töötaja igas instantsis | Toimib (BullMQ jagab töid), aga eraldi töötaja on selgem: API-l `PUSH_WORKER_ENABLED=false`, sama image teise protsessina `PUSH_WORKER_ENABLED=true`. | Järjekorda lisamine ebaõnnestub kiiresti, Notifier logib (docs/12). |
| Better Authi enda sisselogimise limiit on mälus | Jääb instantsipõhiseks (efektiivne limiit N × 100/min). Teadlik valik: Better Authi Redis-salvestus viiks ka sessioonid Redisesse; meie globaalne limiit (Redises) kehtib niikuinii. | – |

Load balancer peab toetama WebSocketi upgrade'i; sticky session'it pole vaja, sest äpp kasutab ainult WebSocket transporti (`transports: ['websocket']`, `lib/realtime.ts`).

## 15.5 Varukoopiad ja taastamine

| Mis | Kuidas | Säilitus |
|---|---|---|
| **Postgres** | Hallatud teenuse automaatsed varukoopiad + **PITR** (point-in-time recovery). Lisaks igaöine loogiline koopia teise teenusepakkuja juurde: `pg_dump -Fc "$DATABASE_URL" \| age -r <avalik-võti> > kapp-$(date +%F).dump.age` → nt Hetzner Storage Box / Scaleway Object Storage. | PITR 7 päeva, ööpäevased 30 päeva |
| **Fotod (R2)** | R2 bucket on ainus koopia. Igaöine `rclone sync r2:kapp-photos backup:kapp-photos` teise EL-i hoidlasse (versioonimisega, kui sihthoidla seda toetab). Kontrolli Cloudflare'i dokumentatsioonist, kas R2 toetab objektide versioonimist; kui ei, on rclone'i koopia ainus kaitse ekslikult kustutatud objekti vastu. Elutsükli reegel: `uploads/` objektid kustutatakse 1 päeva pärast (töötlemata toorfailid, docs/10). | 30 päeva |
| **Redis** | AOF (`appendonly yes`) taaskäivituste jaoks; varukoopiat pole vaja — järjekorras on ainult lühiajalised push-tööd ja meeldetuletused. Kaotuse korral: meeldetuletused jäävad saatmata, muu andmestik on Postgres'is. | – |
| **Saladused** | Paroolihalduris (mitte repos): `BETTER_AUTH_SECRET`, R2 võtmed, Apple/Google võtmed, Play teenusekonto JSON, `age` privaatvõti. EAS hoiab allkirjastamisvõtmeid ise; laadi Androidi keystore alla (`eas credentials`) ja hoia koopiat — ilma selleta ei saa sama äppi Play's uuendada. | – |

**Taastamise harjutus (kord kuus ja enne kaitsmist):**

1. Loo uus tühi andmebaas (staging): `createdb kapp_restore_test` või hallatud teenuse „restore to new instance".
2. `age -d -i key.txt kapp-YYYY-MM-DD.dump.age | pg_restore --no-owner -d "$RESTORE_URL"` (PostGIS laiendus peab olemas olema).
3. `docker run --rm -e DATABASE_URL="$RESTORE_URL" kapp-api node dist/migrate.js` — peab olema no-op.
4. Käivita staging-API selle baasiga, kontrolli `/health` (`"database":"up"`), logi testkasutajaga sisse, ava pargid ja koera foto (foto URL tuleb R2-st).
5. Kirjuta üles kulunud aeg (RTO) ja varukoopia vanus (RPO); kustuta testbaas.

## 15.6 Monitooring ja häired

- **Uptime:** väline kontroll iga minut `GET https://api.<domeen>/health`; häire, kui vastus pole 200 **või** kehas pole `"database":"up"` (märksõnakontroll). EL-is asuv teenus (nt Better Stack, UptimeRobot) — kontroll ei sisalda isikuandmeid.
- **Logid:** pino JSON stdout'i; platvorm või `docker logs` (compose'is rotatsioon 5 × 10 MB). Häire tasemel `error` (50+) ridadele, eriti `shutdown timed out`, `request failed`, `email failed permanently`, `could not queue email`, `storage cleanup failed permanently`, `account storage cleanup could not be queued`, `push job failed`. Hoiatus `privacy policy / terms still contain the controller placeholder` tähendab, et docs/17 p 17.5 samm 1 on tegemata.
- **Andmebaas:** ketta täituvus > 80 %, ühenduste arv, aeglased päringud (hallatud teenuse vaade).
- **Push:** Expo receipts'i vead (`DeviceNotRegistered` puhastab märgid ise, docs/12); BullMQ ebaõnnestunud tööde arv.
- **Äpp:** krahhid — TestFlighti ja Play Console'i krahhiaruanded on tasuta; Sentry (EL-i regioon `de.sentry.io`) on hilisem samm.

## 15.7 Mobiiliäpi väljalase

### Profiilid (`apps/mobile/eas.json`)

| Profiil | Mis | Levitamine | EAS keskkond | Kanal |
|---|---|---|---|---|
| `development` | Development build (expo-dev-client), päris seade | internal (iOS ad hoc: seadmed registreeritud `eas device:create`) | development | – |
| `development-simulator` | Sama iOS simulaatorile | internal | development | – |
| `preview` | Release build testijatele, Androidil APK (otse paigaldatav link) | internal | preview | `preview` |
| `production` | Poe build (iOS IPA, Android AAB), build-number automaatselt | App Store Connect / Play | production | `production` |

**Versioonid:** `cli.appVersionSource: "remote"` + `production.autoIncrement: true`. EAS hoiab iOS-i `buildNumber`-it ja Androidi `versionCode`-i oma serveris ja suurendab neid iga production-ehitusega. Põhjus: poed lükkavad korduva build-numbri tagasi ja käsitsi suurendamine ununeb või läheb harude vahel konflikti; `app.json`-is pole neid välju üldse. Turundusversioon (`expo.version`, praegu `1.0.0`) tõstetakse käsitsi iga poeväljalaske eel (semver: parandus → 1.0.1, uus funktsioon → 1.1.0).

**Lubade tekstid:** asukoht (ainult kasutamise ajal), fotod, kaamera — eesti keeles `app.json`-is ja tõlgituna `src/i18n/native/{et,en,ru}.json` (`locales`), iOS näitab seadme keeles. `NSLocationAlways…` ja `NSMotionUsageDescription` on olemas ainult seetõttu, et expo-location'i natiivne moodul viitab neile API-dele ja App Store Connect lükkab puuduva tekstiga binaari tagasi (ITMS-90683); tekst ütleb ausalt, et taustal asukohta ei kasutata. Face ID tekst on eemaldatud (`faceIDPermission: false`), biomeetriat ei kasutata. Märguannete jaoks iOS teksti ei nõua. `ios.config.usesNonExemptEncryption: false` — äpp kasutab ainult HTTPS-i, App Store Connect ei küsi iga buildi juures ekspordi küsimust.

**Androidi load:** blokeeritud `ACCESS_BACKGROUND_LOCATION`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE` (pildivalija kasutab süsteemi photo picker'it). Alles jäävad internet, asukoht (coarse + fine), kaamera (pildivalija teek), vibratsioon (haptika) ja märguanded.

**Ikoon ja splash:** kasutatakse olemasolevaid (`assets/expo.icon` iOS-ile, adaptiivne ikoon Androidile, `splash-icon.png`); uusi brändivarasid ei lisatud. App Store vajab lisaks ekraanipilte (6,9" ja 6,5" iPhone) ja Play 512 × 512 ikooni + 1024 × 500 bännerit — need tehakse Figmast.

### EAS Update (OTA)

Kanalid on profiilides valmis, kuid `expo-updates` pole veel paigaldatud: see on natiivne moodul (vajab uut development build'i) ja `updates.url` vajab EAS projekti ID-d. Pärast `eas init`-i:

```bash
cd apps/mobile
npx expo install expo-updates
npx eas-cli@latest update:configure        # lisa väljastatud updates.url ja runtimeVersion app.json-i
# runtimeVersion: { "policy": "fingerprint" } — uuendus jõuab ainult sama natiivse koodiga buildideni
npx eas-cli@latest update --channel preview --environment preview --message "Paranda X"
```

`fingerprint` poliitika arvutab natiivse koodi sõrmejälje: kui lisad natiivse paketi, ei jõua JS-uuendus vanade buildideni (mis krahhiks), vaid vaja on uut buildi. `appVersion` poliitika nõuaks iga natiivse muutuse korral käsitsi versiooni tõstmist.

## 15.8 CI/CD

- **`ci.yml` → `check`** (olemasolev): tüübid, lint, i18n, a11y, unit/HTTP, integratsioon (PostGIS, Redis, MinIO; nüüd ka kahe instantsi limiidid + Socket.IO adapter ja migraator).
- **`ci.yml` → `docker`** (uus, iga PR): ehitab production image'i (ei push'i), migreerib tühja PostGIS-i, käivitab `NODE_ENV=production` režiimis Redis-limiitide ja adapteriga, kontrollib `/health` (`"database":"up"`) ja et `docker stop` lõpetab koodiga 0.
- **`release-api.yml`** (ainult käsitsi): ehitab ja push'ib `ghcr.io/<omanik>/<repo>/api:<sha>` ja `:<keskkond>` (GitHubi enda token, lisakontot pole), kutsub valikuliselt `DEPLOY_HOOK_URL` saladust (Render/Coolify deploy hook). Migratsioon jookseb platvormi pre-deploy käsuna, mitte GitHubist (andmebaas pole Actionsist ligipääsetav ega peakski olema). GitHubi `production` keskkonnale saab lisada kohustusliku ülevaataja.
- **`release-mobile.yml`** (ainult käsitsi): järjekorrastab `eas build` (valikuliselt `--auto-submit`), vajab saladust `EXPO_TOKEN`, ilma selleta peatub selge veateatega.

## 15.9 Käsitsi sammud samm-sammult

Kõiki EAS käske jooksuta kaustas `apps/mobile` kujul `npx eas-cli@latest <käsk>`.

### A. Kontod (ühekordselt)

1. **Expo** konto (tasuta plaan piisab: piiratud arv ehitusi kuus).
2. **Apple Developer Program** (99 USD aastas) — vajalik ka TestFlighti jaoks.
3. **Google Play Console** arendajakonto (ühekordne 25 USD). Uutel isiklikel kontodel nõuab Google enne *production*'it suletud testi (12 testijat, 14 päeva); *internal testing* töötab kohe.
4. Hostimine (15.1): Hetzner/Scaleway/Aiven, Cloudflare (R2), domeen.

### B. API üles

1. Loo hallatud Postgres 17 (EL), lülita sisse PostGIS (`0000_enable_postgis.sql` teeb `CREATE EXTENSION`, kasutajal peab olema selleks õigus) ja PITR.
2. Loo R2 bucket `kapp-photos` **EU jurisdiction**'iga, privaatne, elutsükli reegel `uploads/` → 1 päev; API token ainult selle bucketi lugemiseks/kirjutamiseks.
3. VM: paigalda Docker, klooni repo, `cp apps/api/.env.production.example api.env`, täida väärtused (`REDIS_URL=redis://redis:6379`), DNS `api.<domeen>` → VM-i IP.
4. `docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml run --rm migrate && API_DOMAIN=api.<domeen> docker compose -f docker-compose.prod.yml up -d redis api caddy`.
5. `curl https://api.<domeen>/health` → `{"status":"ok","database":"up"}`. Seemneandmed (`npm run db:seed`) on ainult arenduseks — ära jooksuta toodangus (seeme on idempotentne ja lisab ainult puuduvad näidispargid ja väljamõeldud teenusepakkujad).
6. Seadista uptime-kontroll ja öised varukoopiad (15.5, 15.6).

### C. EAS projekt ja keskkonnamuutujad

1. `npx eas-cli@latest login`
2. `npx eas-cli@latest init` — loob Expo projekti. Kuna `app.config.ts` on dünaamiline, ei pruugi EAS saada `app.json`-i ise muuta: lisa väljastatud ID käsitsi `app.json` → `expo.extra.eas.projectId` (ja `expo.owner`) ning commit'i see (ID ei ole saladus). Push-märk hakkab seadmes tööle alles pärast seda (docs/12).
3. Keskkonnamuutujad:
   ```bash
   npx eas-cli@latest env:create --environment preview    --name EXPO_PUBLIC_API_URL --value https://api-staging.<domeen> --visibility plaintext
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_API_URL --value https://api.<domeen>         --visibility plaintext
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_AUTH_APPLE --value false --visibility plaintext
   ```
   Lokaalseks arenduseks jääb `.env.local` (docs/08); `npx eas-cli@latest env:pull --environment development` kirjutab EAS-i väärtused sinna.

### D. Allkirjastamine ja push-võtmed

1. **iOS:** esimene `eas build --platform ios` pakub Apple'i kontoga sisse logida ja loob sertifikaadi + provisioning profile'i (EAS hoiab neid). Push: `npx eas-cli@latest credentials` → iOS → production → *Push Notifications: set up a key* (APNs key).
2. **Android:** esimene build loob keystore'i (EAS hoiab; laadi koopia alla). Push vajab Firebase'i: loo Firebase'i projekt, lisa Android äpp paketiga `ee.icd0018.kapp`, laadi alla `google-services.json`, pane see `apps/mobile/`-i ja lisa `app.json` → `android.googleServicesFile: "./google-services.json"`; seejärel `credentials` → Android → *FCM V1 service account key* (Firebase'i teenusekonto JSON, **ei** commit'ita).
3. **Apple Sign In / Google** (valikuline): docs/07.

### E. Preview build testijatele

```bash
npx eas-cli@latest device:create                          # iOS: registreeri testijate iPhone'id (ad hoc)
npx eas-cli@latest build --profile preview --platform all
```

Androidi testijad saavad APK lingi/QR-koodi, iOS-i testijad paigaldavad lingilt (ainult registreeritud seadmed). Kui `app.config.ts` katkestab ehituse, loe veateadet: puudub `EXPO_PUBLIC_API_URL` või `projectId`.

### F. TestFlight (iOS internal testing)

1. `npx eas-cli@latest build --profile production --platform ios`
2. `npx eas-cli@latest submit --platform ios --latest` — esimesel korral loob EAS App Store Connecti äpi kirje (bundle id `ee.icd0018.kapp`) või küsib selle ID-d.
3. App Store Connect → TestFlight → *Internal Testing* → lisa grupp ja testijad (App Store Connecti kasutajad, kuni 100). Sisemine testimine ei vaja Apple'i ülevaatust; välistestijad vajavad Beta App Review'd (privaatsuspoliitika URL `https://api.<domeen>/legal/privacy`; konto kustutamine on Seaded → Konto, docs/17).

### G. Google Play internal testing

1. Play Console → *Create app* (nimi Käpp, tasuta, deklaratsioonid).
2. `npx eas-cli@latest build --profile production --platform android` → laadi AAB alla.
3. **Esimene AAB käsitsi:** *Testing → Internal testing → Create release* → laadi AAB üles (Google'i API ei saa enne esimest üleslaadimist äppi luua). Play App Signing jääb sisse.
4. Google Cloudi teenusekonto Play Console'i õigustega → JSON faili `apps/mobile/secrets/google-play-service-account.json` (kaust on `.gitignore`'is).
5. Edaspidi: `npx eas-cli@latest submit --platform android --latest` (rada `internal`, `eas.json` → `submit.production`).
6. Lisa testijate e-postid internal testing nimekirja ja jaga opt-in linki.

### H. CI saladused (valikuline)

- `EXPO_TOKEN` (expo.dev → Access tokens) → `release-mobile.yml`.
- `DEPLOY_HOOK_URL` → `release-api.yml` (kui platvorm pakub deploy hook'i).

## 15.10 Väljalaske kontrollnimekiri

- [ ] `main` roheline (CI `check` + `docker`), muudatused PR-is üle vaadatud
- [ ] Turundusversioon tõstetud (`app.json` → `expo.version`); build-number tõuseb ise
- [ ] Uued migratsioonid üle vaadatud (tagasiühilduvad: vana API versioon töötab uue skeemiga kuni vahetuseni — veergu ei kustutata samas väljalaskes, kus kood selle kasutamise lõpetab)
- [ ] API: image push'itud → `node dist/migrate.js` → deploy → `/health` → suitsutest (sisselogimine, pargid, foto)
- [ ] Äpp: `eas build --profile production` → `eas submit` → TestFlight / Play internal testing → testijate tagasiside
- [ ] Natiivne muutus (uus natiivne pakett, lubade tekst)? → uus build, mitte OTA
- [ ] Poe metaandmed et/en/ru: nimi, alapealkiri, kirjeldus, märksõnad, ekraanipildid, tugi-URL
- [ ] Privaatsuspoliitika URL (`/legal/privacy`), App Privacy (Apple) ja Data safety (Google, sh kustutamise veebilink) vastavad 15.2-le; vastutav töötleja täidetud, versiooni tõstetud, kui tekst muutus (docs/17)
- [ ] E-post: `MAIL_PROVIDER`, `MAIL_FROM`, võti; SPF/DKIM/DMARC kirjed; testkiri (parooli taastamine) jõudis postkasti
- [ ] Vanuse hinnang, sisu deklaratsioonid, testkonto App Review jaoks (e-post + parool)
- [ ] Varukoopia tehtud enne migratsiooni; taastamise harjutus viimase kuu jooksul

## 15.11 Mida pole kontrollitud

- `eas build`/`eas submit`/`eas update` pole kordagi käivitatud (kontod puuduvad) — `eas.json` vastab Expo dokumentatsioonile (SDK 57, eas-cli ≥ 18), aga EAS-i serveri valideerimine on kontrollimata.
- `EAS_BUILD_PROFILE` kontroll `app.config.ts`-is põhineb dokumentatsioonil; kontrolli esimese preview-ehituse logist, et puuduv URL katkestab ehituse.
- Privaatsusmanifesti ja lubade tekstide natiivne tulemus (Info.plist, InfoPlist.strings, PrivacyInfo.xcprivacy, AndroidManifest) on kontrollitud ainult `npx expo config --type introspect`-iga, mitte päris buildiga ega App Store Connecti valideerimisega.
- Hallatud Postgres/Redis, R2 EU jurisdiction ja TLS-iga Caddy pole päriselt üles seatud; image on testitud lokaalse docker-compose'i ja CI teenuste vastu (Linux arm64 lokaalselt, amd64 CI-s).
- Hinnad ja teenuste omadused (nt R2 versioonimine, hallatud PostGIS-i versioonid) muutuvad — kontrolli enne tellimist.
