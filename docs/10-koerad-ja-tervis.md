# 10. Koerte fotod ja tervis (M4) — spetsifikatsioon

Leping (Zod) on juba olemas: `packages/shared/src/schemas.ts`, jaotised „dog photos (M4)" ja „health records (M4)". Teostus järgib dokumenti [06-koodistandard.md](06-koodistandard.md).

## Fotod

### Hoidla

- S3-ühilduv objektihoidla. Arenduses **MinIO** Dockeris (`docker-compose.yml`), toodangus **Cloudflare R2**. Kood kasutab ainult S3 API-t (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`).
- Konfiguratsioon (`config/env.ts`, kõik valideeritud): `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT` (aadress, mille kaudu telefon/simulaator objektidele ligi pääseb; allkirjastatud URL-id tehakse selle järgi), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`.
- **Bucket on privaatne.** Pildid antakse välja ainult lühiajaliste allkirjastatud GET-URL-idega (15 min).

### Voog

1. `POST /api/v1/me/dogs/:dogId/photos/uploads` `{ contentType, byteSize }` → `201 PhotoUpload`. Allkirjastatud PUT-URL võtmele `uploads/<userId>/<uuid>`, kehtib 10 min.
2. Klient laeb faili otse hoidlasse (`PUT url`, päised `headers`).
3. `POST /api/v1/me/dogs/:dogId/photos` `{ uploadKey, caption? }` → `201 DogPhoto`. Server:
   - kontrollib, et võti algab `uploads/<sessiooni kasutaja id>/` (muidu `404`), objekt on olemas ja ≤ `MAX_PHOTO_BYTES`;
   - laeb objekti, valideerib `sharp`-iga, et see on päris pilt (mitte ainult õige `Content-Type`);
   - kodeerib ümber, mis **eemaldab EXIF-i, sh GPS-asukoha**: põhipilt pikem külg ≤ 1600 px (WebP), pisipilt ≤ 400 px (WebP); salvestab võtmetega `dogs/<dogId>/<photoId>/full.webp` ja `thumb.webp`;
   - kustutab toorfaili; kui midagi ebaõnnestub, ei jää andmebaasi poolikut rida.
4. `GET /api/v1/me/dogs/:dogId/photos` → `DogPhoto[]` (uusim ees).
5. `DELETE /api/v1/me/dogs/:dogId/photos/:photoId` → `204`, kustutab ka objektid. Kui see oli profiilipilt, muutub `profilePhoto` väärtuseks `null`.
6. `PUT /api/v1/me/dogs/:dogId/profile-photo` `{ photoId | null }` → `200 Dog`.

Reeglid: ainult omaniku koerad (võõras → `404`), kuni `MAX_PHOTOS_PER_DOG` fotot (`409`), pildi üleslaadimise URL-i loomisel kiiruspiirang. Koera kustutamisel kustuvad ka objektid.

### Andmemudel

- `dog_photos`: lisada `thumbnail_key`.
- `dogs`: profiilipilt viitena (`profile_photo_id → dog_photos.id`, `on delete set null`) või olemasolev `photo_key`; vali üks ja põhjenda koodikommentaaris.
- `Dog.profilePhoto` täidetakse kõigis koera vastustes.

## Tervis

Tervisekirjed on **ainult omanikule**. Need ei ilmu üheski teises vastuses ega ühelegi teisele kasutajale.

| Meetod ja tee | Kirjeldus |
|---|---|
| `GET /api/v1/me/dogs/:dogId/health-records` | Kirjed, uusim kuupäev ees |
| `POST /api/v1/me/dogs/:dogId/health-records` | `HealthRecordInput` → `201 HealthRecord` |
| `PATCH /api/v1/me/dogs/:dogId/health-records/:recordId` | `UpdateHealthRecordInput`; kui uuendus muudaks `nextDue ≤ date`, siis `400` |
| `DELETE /api/v1/me/dogs/:dogId/health-records/:recordId` | `204` |
| `GET /api/v1/me/health-reminders` | Kõigi oma koerte kirjed, mille `nextDue` on `REMINDER_WINDOW_DAYS` päeva sees või möödas; `overdue` märgib möödunud |

Vaktsineerimispassi või muude dokumentide üleslaadimine jääb hilisemaks (sama voog, aga PDF-iga).

## Äpp

- `dogs/[dogId]` – koera profiil (Figma 04 / Dog / Profile): profiilipilt, andmed, lingid „Fotod" ja „Tervis ja vaktsiinid", „Muuda".
- `dogs/[dogId]/photos` – ruudustik (pisipildid), lisamine kaamerast või galeriist (`expo-image-picker`, loa selgitused eesti keeles `app.json`-is), pikk vajutus → „Määra profiilipildiks" / „Kustuta".
- `dogs/[dogId]/health` – kirjed tüübi järgi, „Lisa vaktsineerimine" / „Lisa arstivisiit" modaal, kustutamine kinnitusega.
- Avalehel tervise meeldetuletused (≤ 30 päeva või möödas).
- „Minu koerad" nimekirjas profiilipildi pisipilt.

## Testid

- Unit: teenused mock'itud repositooriumi ja mock'itud hoidlaga (liides `ObjectStorage`), sh võõra kasutaja võti, liiga suur fail, mitte-pilt, ajapiirang, hoidla viga.
- HTTP: kõik endpoint'id (401/400/404/409/503, `null` väärtused, vigased ID-d).
- Integratsioon: päris MinIO ja Postgres (CI-sse lisada MinIO teenus): täisvoog üleslaadimisest kustutamiseni, EXIF/GPS on pärast töötlust kadunud, tervisekirjed ja meeldetuletused.
