# 3. Andmemudel

Lähtekood: [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts) · migratsioonid: [`apps/api/drizzle/`](../apps/api/drizzle)

Tabelid on tuletatud Figma vaadetest (leht *03 · Screens*, sektsioonid 01–08).

| Valdkond | Tabelid | Figma vaated |
|---|---|---|
| Konto | `user`, `session`, `account`, `verification` (Better Auth) | 01 Welcome & Account, 07 Profile / Edit, Settings / Privacy |
| Koerad | `dogs`, `dog_photos` | 04 My Dogs, Dog Profile, Edit Profile, Photos |
| Tervis (privaatne) | `health_records` (vaktsiin / visiit) | 04 Health, Add Vaccination, Vet Visit |
| Pargid | `parks` (PostGIS punkt, omadused, staatus) | 02 Map, Park List, Filters, Park Overview; 06 Add Park |
| Külastused | `check_ins`, `check_in_dogs`, `planned_visits` | 03 Check In, Active, Plan, Planned, History |
| Hinnangud ja teated | `reviews` (1–5), `park_reports`, `favorite_parks` | 02 Reviews; 03 Add Review, Report Issue; 05 Favorite Parks |
| Kogukond | `friendships`, `conversations`, `conversation_members`, `messages` | 05 Friends, Friend Profile, Inbox, Conversation |
| Turvalisus | `user_blocks`, `user_reports` | 08 Report or Block, Settings / Privacy |
| Teavitused | `notifications`, `push_tokens` | 05 Notifications / Activity, Settings / Notifications |
| Teenused (M6) | `service_providers`, `provider_hours`, `services`, `bookings`, `booking_dogs` | 06 Services, Groomer, Select Time, Confirmed, My Bookings |

## Olulised reeglid

- **Kohalolek aegub:** `check_ins.expires_at` on kohustuslik (vaikimisi 60 min). Aktiivne = `ended_at is null and expires_at > now()`.
- **Üks avatud kohalolek kasutaja kohta:** osaline unikaalne indeks `check_ins_one_open_per_user_uq` (`user_id` where `ended_at is null`); uus check-in sulgeb eelmise samas transaktsioonis.
- **Pargi lisamine:** uued pargid on `status = 'pending'` kuni modereerimiseni; `/parks/nearby` tagastab ainult `approved`.
- **Broneeringud (M6):** ühel teenusepakkujal ei saa olla kahte ajaliselt kattuvat aktiivset broneeringut, ka eri teenustele (välistuspiirang `bookings_no_overlap`, `btree_gist`; tühistatud vabastavad aja); teenus peab kuuluma broneeritud pakkujale (liitvõti); hind sentides, broneeringusse kopeeritud; vabad ajad arvutatakse lahtiolekuaegadest pakkuja ajavööndis. Vt [13-teenused.md](13-teenused.md).
- **Hinnang:** `reviews.rating` vahemikus 1–5 (CHECK-piirang); üks hinnang kasutaja ja pargi kohta (`reviews_user_park_uq`); hinnata saab ainult külastatud parki; pargi lehel keskmine ühe komakohaga.
- **Lemmikud:** `favorite_parks` (user_id + park_id liitvõti); nimekirjas ainult `approved` pargid, tagasi lükatud park kaob nimekirjast, aga rida jääb alles.
- **Sõprus (M5):** vastastikune, kinnitatav; üks rida paari kohta mõlemas suunas (`friendships_pair_uq` avaldistel `least/greatest`), iseendaga mitte (`CHECK`). Vt [12-kogukond.md](12-kogukond.md).
- **Vestlused (M5):** 1:1 vestlus on unikaalse `conversations.direct_key`-ga; sõnum 1–2000 märki (`CHECK`); lugemata = teise sõnumid pärast `conversation_members.last_read_at`-i.
- **Teavitused (M5):** `type` + `actor_id` + `data jsonb`, tekste ei salvestata (äpp ja push tõlgivad); push'i eelistused tabelis `notification_preferences`, keel `user.language`.
- **Blokeerimine (M5):** mõlemas suunas peitev; blokeerimine kustutab sõpruse samas transaktsioonis.
- **Pildid:** tabelites ainult objektivõtmed (`photo_key`, `image_key`, `thumbnail_key`, `document_key`), failid privaatses S3-hoidlas (R2 / arenduses MinIO). Koera profiilipilt on viide `dogs.profile_photo_id → dog_photos.id` (`on delete set null`), vt [10-koerad-ja-tervis.md](10-koerad-ja-tervis.md).

## Avatud küsimused

- ~~Kas sõbrad on ühesuunalised või kahesuunalised?~~ Otsustatud M5-s: kahesuunalised, kinnitatava kutsega.
- ~~Kas teenusepakkujad on äpi kasutajad (oma vaade) või haldab neid admin?~~ Otsustatud M6-s: haldab Käpi meeskond (seeme / admin), pakkujakontosid pole; broneering kinnitub kohe.
- Kui kaua hoitakse lõpetatud kohalolekut ajaloo jaoks (GDPR: säilitusaeg)?
