# 10. Koerte fotod ja tervis (M4)

Leping (Zod): `packages/shared/src/schemas.ts`, jaotised „dog photos (M4)" ja „health records (M4)". Teostus järgib dokumenti [06-koodistandard.md](06-koodistandard.md).

## Mis on valmis

| Funktsioon | API | Äpp |
|---|---|---|
| Koera profiil | `Dog.profilePhoto` kõigis koera vastustes (`GET/POST /me/dogs`, `PATCH /me/dogs/:dogId`) | `dogs/[dogId]` – pilt, andmed, lingid „Fotod" ja „Tervis ja vaktsiinid", „Muuda"; „Minu koerad" nimekirjas pisipilt |
| Foto lisamine | `POST /me/dogs/:dogId/photos/uploads` → `PUT` hoidlasse → `POST /me/dogs/:dogId/photos` | `dogs/[dogId]/photos`: „Pildista" / „Vali galeriist" |
| Fotod | `GET /me/dogs/:dogId/photos`, `DELETE /me/dogs/:dogId/photos/:photoId` | Pisipiltide ruudustik; puudutus või pikk vajutus → „Määra profiilipildiks" / „Eemalda profiilipildist" / „Kustuta" (kinnitusega) |
| Profiilipilt | `PUT /me/dogs/:dogId/profile-photo` `{ photoId \| null }` → `200 Dog` | Sama menüü |
| Tervisekirjed | `GET/POST /me/dogs/:dogId/health-records`, `PATCH/DELETE …/:recordId` | `dogs/[dogId]/health` (vaktsineerimised ja arstivisiidid eraldi), `dogs/[dogId]/health-edit` modaal, kustutamine kinnitusega (pikk vajutus või modaalis) |
| Meeldetuletused | `GET /me/health-reminders` | Avalehel „Tervise meeldetuletused" (kuni 3, möödunud punasega) |

## Fotod

### Hoidla

- S3-ühilduv objektihoidla liidese `ObjectStorage` taga (`apps/api/src/storage/`), teostus `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Arenduses ja CI-s **MinIO** (`docker-compose.yml`), toodangus mõeldud **Cloudflare R2**.
- MinIO ei avalda enam Docker Hubis pilte (`minio/minio` annab 404), seega kasutatakse Chainguardi lähtekoodist ehitatud `chainguard/minio` ja `chainguard/minio-client` pilte. Bucket luuakse ühekordse teenusega `minio-setup` (`npm run db:up` käivitab selle `docker compose run --rm minio-setup` kaudu; profiilis `setup`, sest osa Compose'i versioone peab lõpetanud konteinerit `up --wait` all veaks).
- Seaded (`config/env.ts`): `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT` (vaikimisi = `S3_ENDPOINT`), `S3_REGION`, `S3_BUCKET` (`kapp-photos`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (toodangus kohustuslikud, arenduses MinIO vaikeväärtused), `S3_FORCE_PATH_STYLE` (vaikimisi `true`).
- Server kasutab kahte klienti: üks räägib hoidlaga `S3_ENDPOINT` kaudu, teisega allkirjastatakse telefonile antavad URL-id `S3_PUBLIC_ENDPOINT` järgi (host on allkirja osa). **Päris telefonis** peab `S3_PUBLIC_ENDPOINT` olema `http://<arvuti-IP>:9000`, nagu `EXPO_PUBLIC_API_URL`.
- **Bucket on privaatne** (allkirjata GET → `403`, kontrollitud). Pildid antakse välja ainult 15 min kehtivate allkirjastatud GET-URL-idega.
- Uuemad AWS SDK-d lisavad igale üleslaadimisele CRC32 kontrollsumma; see on välja lülitatud (`requestChecksumCalculation: 'WHEN_REQUIRED'`), muidu peaks telefon saatma ka kontrollsumma päise.

### Voog

1. `POST …/photos/uploads` `{ contentType, byteSize }` → `201 PhotoUpload`. Võti `uploads/<userId>/<uuid>`, PUT-URL kehtib 10 min. **`Content-Type` ja `Content-Length` on allkirjas**: suurem või teist tüüpi fail lükatakse hoidla poolt tagasi (`403`, kontrollitud MinIO-ga).
2. Äpp kodeerib pildi seadmes ümber JPEG-iks (pikim külg ≤ 2048 px, `expo-image-manipulator`) ja laeb selle otse hoidlasse (`PUT url`, päised `headers`).
3. `POST …/photos` `{ uploadKey, caption? }` → `201 DogPhoto`. Server:
   - kontrollib, et võti algab `uploads/<sessiooni kasutaja id>/` (muidu `404`, objekti isegi ei vaadata), koer on kasutaja oma ja fotode limiit pole täis;
   - kontrollib objekti suurust (`HEAD`, ja uuesti lugemisel) ≤ `MAX_PHOTO_BYTES`, muidu `400` ja toorfail kustutatakse;
   - dekodeerib `sharp`-iga: lubatud on ainult JPEG, PNG, WebP ja HEIF/AVIF **sisu järgi**, mitte `Content-Type` järgi (SVG, GIF jms → `400`); pikslite ülempiir 48 MP (dekompressioonipommi kaitse);
   - pöörab pildi EXIF-i orientatsiooni järgi ja kodeerib ümber WebP-ks: põhipilt ≤ 1600 px, pisipilt ≤ 400 px. `sharp` ei kirjuta metaandmeid, seega **EXIF, sh GPS-asukoht, kaob** (kontrollitud unit- ja integratsioonitestis `exif-reader`-iga: sisendis on GPS, väljundis pole EXIF-it üldse);
   - salvestab `dogs/<dogId>/<photoId>/full.webp` ja `thumb.webp`, **siis** andmebaasirea; kui kirjutamine või rida ebaõnnestub, kustutatakse juba kirjutatud objektid ja rida ei teki;
   - kustutab toorfaili (see võib sisaldada GPS-i).
4. `GET …/photos` → uusim ees, värsked allkirjastatud URL-id.
5. `DELETE …/photos/:photoId` → `204`; rida kustub, profiilipilt muutub võõrvõtme tõttu (`on delete set null`) `null`-iks, seejärel kustutatakse objektid prefiksi järgi.
6. `PUT …/profile-photo` → `200 Dog`. Teise koera foto → `404` (kontroll on samas `UPDATE`-lauses).

Koera kustutamisel kustuvad read kaskaadiga ja objektid prefiksi `dogs/<dogId>/` järgi.

**Reeglid:** ainult omaniku koerad (võõras või puuduv → sama `404`), kuni 50 fotot koera kohta (`409`, nagu koerte limiit pole see võidujooksu-kindel – see kaitseb kuritarvituse eest), üleslaadimise URL-i loomine ja foto töötlemine on piiratud 60 korraga tunnis kasutaja IP kohta. Hoidla viga või aeglus → `503` „Pildihoidla ei vasta, proovi hetke pärast uuesti" (SDK viga logitakse `cause`-na, kliendini ei jõua).

### Andmemudel

- `dog_photos.thumbnail_key` lisatud; indeks `(dog_id, created_at)` nimekirja jaoks.
- `dogs.profile_photo_id → dog_photos.id on delete set null` asendab kasutamata `photo_key` veeru. Põhjus: kustutatud foto puhastab profiilipildi andmebaasis endas ja pisipilt tuleb kaasa. Et foto kuulub samale koerale, kontrollitakse `UPDATE`-lauses.
- Migratsioonid `0003_m4_photos_health.sql` ja `0004_m4_drop_dog_photo_key.sql` (kaks faili, sest `drizzle-kit` küsib veeru kustutamise ja lisamise korral interaktiivselt „ümbernimetamine või uus?").

### Äpp

- Pilt valitakse süsteemi pildivalijast (luba pole vaja) või tehakse kaameraga (`requestCameraPermissionsAsync`; keeldumisel „Ava seaded"). Loa selgitused on eesti keeles `app.json`-is, mikrofoni luba on välja lülitatud.
- **Seadmes JPEG-iks:** iPhone pildistab HEIC-i (HEVC), mida serveri `sharp`-i valmisehitus ei oska dekodeerida (toetab ainult AVIF-i), ja 12 MP originaal oleks mobiilivõrgus aeglane. Privaatsuse eest vastutab ikkagi server.
- Allkirjastatud URL muutub iga päringuga, seega `expo-image` vahemälu võti on objekti tee ilma allkirjata (võtmed ei muutu kunagi). Fotonimekiri loetakse vananenuks 5 min pärast, et URL-id uueneksid ammu enne 15 min möödumist.

## Tervis

Tervisekirjed on **ainult omanikule**: iga meetod algab omaniku kontrollist, kirjed ei ilmu üheski teises vastuses (integratsioonitest kontrollib ka koera vastuse välju).

| Meetod ja tee | Kirjeldus |
|---|---|
| `GET /api/v1/me/dogs/:dogId/health-records` | Kirjed, uusim kuupäev ees |
| `POST /api/v1/me/dogs/:dogId/health-records` | `HealthRecordInput` → `201 HealthRecord` |
| `PATCH /api/v1/me/dogs/:dogId/health-records/:recordId` | `UpdateHealthRecordInput`; kui uuendus koos salvestatud väärtusega annaks `nextDue ≤ date`, siis `400` |
| `DELETE /api/v1/me/dogs/:dogId/health-records/:recordId` | `204`, korduval kustutamisel `404` (nagu koerad ja plaanid) |
| `GET /api/v1/me/health-reminders` | Kõigi oma koerte kirjed, mille `nextDue` on 30 päeva sees või möödas, soonest esimesena; `overdue` märgib möödunud |

- Moodul on `modules/health-records/`, sest `modules/health/` on juba koormusjaoturi `GET /health` päralt.
- `nextDue > date` kehtib ka andmebaasis (`CHECK health_records_next_due_after_date`). Teenus võrdleb PATCH-i salvestatud väärtusega sõbraliku veateate jaoks; samaaegse muudatuse püüab CHECK kinni ja see tõlgitakse samuti `400`-ks.
- „Täna" on meeldetuletustes **Europe/Tallinn** kuupäev (`(now() at time zone 'Europe/Tallinn')::date`), mitte serveri UTC, muidu muutuks kirje südaöö paiku kuni 3 h vales ajas „möödunuks".
- **Asendatud kirjed peidetakse:** kui samal koeral on hilisem sama liigi ja pealkirjaga (tõstutundetult) kirje, ei meenuta vana kirje enam oma tähtaega. Muidu jääks korratud vaktsiini vana tähtaeg igavesti „möödunuks". See on spetsifikatsiooni täiendus.
- Vaktsineerimispassi või muude dokumentide üleslaadimine jääb hilisemaks (sama voog, PDF-iga).

## Testid

- **Unit (44):** `photo-image.test.ts` – GPS ja kogu EXIF eemaldatakse, orientatsioon rakendatakse, 1600/400 px, väikest pilti ei suurendata, tekst/tühi fail/SVG/GIF/poolik JPEG lükatakse tagasi. `m4-services.test.ts` – fotod mock'itud repositooriumi ja mock'itud hoidlaga: võõra kasutaja võti (hoidlat ei puudutata), puuduv üleslaadimine, liiga suur objekt (ka lugemise hetkel), mitte-pilt, limiit, hoidla viga → `503` (`cause` säilib), andmebaasi viga eemaldab objektid, ajapiirang (vale-taimeritega, ootus lisatud enne aja kerimist); koera kustutamine kustutab objektid; tervisekirjete omanikukontroll, PATCH-i kuupäevareeglid, CHECK-rikkumine → `400`, ajapiirang.
- **HTTP (67):** kõik 10 endpoint'i – 401 (ka vigase ID-ga), vigased ID-d nimetatud väljaga, puuduv/`null` sisu, `null` väärtused (`photoId: null`, `nextDue: null`), tundmatud väljad, teenuse 400/404/409/503, ootamatu viga → 500 ilma detailideta, kiiruspiirang → 429.
- **Integratsioon (17, päris Postgres + MinIO):** allkirjast suurem PUT → 403; täisvoog üleslaadimisest töötluseni; salvestatud pildil pole EXIF-it (GPS kadunud), suurus ja orientatsioon õiged; allkirjata GET → 403; nimekiri; profiilipilt kõigis koera vastustes; teine kasutaja ei saa kasutada koera, fotot ega üleslaadimise võtit; mitte-pilt → 400 ja toorfail kustub; profiilipildi kustutamine; koera kustutamine kustutab objektid; tervisekirjed, meeldetuletused (aken, möödunud, asendatud), PATCH-i reeglid, CHECK andmebaasis, privaatsus teise kasutaja vastu.
- CI käivitab MinIO `docker-compose.yml`-ist ja jooksutab integratsioonitestid (roheline).

## Mida ei kontrollitud

- **Äppi ei käivitatud simulaatoris ega telefonis.** Kontrollitud on `tsc --noEmit` (koos genereeritud tüübitud marsruutidega), `expo lint` ja `expo-doctor` (21/21). Läbi klõpsata tuleb: koera profiil, fotode lisamine kaamerast ja galeriist, profiilipildi määramine, kustutamised, tervisekirje lisamine/muutmine, meeldetuletused avalehel.
- `expo-image-picker` ja `expo-image-manipulator` on natiivsed moodulid: **vaja on uut development build'i** (`npx expo run:ios`), olemasolev build neid ei sisalda.
- Seadme üleslaadimine (`fetch` Blob-kehaga allkirjastatud URL-ile) ja HEIC → JPEG teisendus on kontrollimata; serveri pool sama PUT-iga on testitud Node'i `fetch`-iga.
- Cloudflare R2 vastu pole proovitud (ainult MinIO). R2 jaoks: `S3_REGION=auto`, oma võtmed, bucket privaatseks ja soovitatavalt elutsükli reegel, mis kustutab `uploads/` objektid 1 päeva pärast (töötlemata jäänud toorfailid). MinIO arenduses seda reeglit ei sea.
- Kasutajakonto kustutamisel jäävad tema koerte objektid hoidlasse (kontot kustutada veel ei saa).
