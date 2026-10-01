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
| Teenused | `service_providers`, `services`, `bookings` | 06 Services, Groomer, Select Time, Confirmed, My Bookings |

## Olulised reeglid

- **Kohalolek aegub:** `check_ins.expires_at` on kohustuslik (vaikimisi 60 min). Aktiivne = `ended_at is null and expires_at > now()`.
- **Pargi lisamine:** uued pargid on `status = 'pending'` kuni modereerimiseni; `/parks/nearby` tagastab ainult `approved`.
- **Broneeringud:** ühele teenusele ühele ajale saab olla üks aktiivne broneering (osaline unikaalne indeks, tühistatud vabastavad aja).
- **Hinnang:** `reviews.rating` vahemikus 1–5 (CHECK-piirang).
- **Pildid:** tabelites ainult objektivõtmed (`photo_key`, `image_key`, `document_key`), failid R2-s.

## Avatud küsimused

- Kas sõbrad on ühesuunalised (jälgimine) või kahesuunalised (praegu: kinnitatav sõbrakutse)?
- Kas teenusepakkujad on äpi kasutajad (oma vaade) või haldab neid admin?
- Kui kaua hoitakse lõpetatud kohalolekut ajaloo jaoks (GDPR: säilitusaeg)?
