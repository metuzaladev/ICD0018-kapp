# 4. Arendusplaan

Etapid on prioriteedi järjekorras. **M0–M3 ja M8 on miinimum kaitsmiseks**; M4–M7 lisavad väärtust, kui aega jääb.
Iga etapp lõpeb töötava äpiga simulaatoris, rohelise tüübikontrolli ja testidega.

| Etapp | Sisu | Kursuse õpiväljund | Valmis, kui |
|---|---|---|---|
| **M0 Vundament** ✅ | Monorepo, Expo äpp (4 tab'i, Figma tokenid, tume teema), Fastify API, Postgres + PostGIS, migratsioonid, seed, testid, dokumentatsioon | Tehnoloogiate hindamine ja valik; arendustsükli kirjeldus | `npm run typecheck && npm test` roheline, äpp näitab API-st parke |
| **M1 Autentimine ja profiil** 🟡 | Better Auth (e-post ✅, Apple ja Google ühendatud, ootavad võtmeid), sessioon SecureStore'is ✅, konto vaated ✅, parooli taastamine ✅, profiili vaatamine ja muutmine ✅, Manrope + DM Sans ✅. Vt [07-autentimine.md](07-autentimine.md) | Kasutaja autentimine | Uus kasutaja saab registreeruda, välja ja sisse logida mõlemal platvormil |
| **M2 Pargid ja kaart** 🟡 | MapLibre + OpenFreeMap (development build) ✅, seadme asukoht ✅, pargi detailvaade ✅, filtrid ✅ (v.a koerte suurus), lemmikud ✅, TanStack Query ✅, offline-bänner ✅. Vt [08-pargid-ja-kaart.md](08-pargid-ja-kaart.md) | Natiivsed võimalused hübriidäpis | Kaardil on pargid, markerilt avaneb park, filtrid töötavad |
| **M3 Kohalolek ja külastused** 🟡 | Check-in koos aegumisega ✅ (aegub lugemisel, BullMQ pole vaja), privaatsusreeglitega „kes on pargis" ✅, planeerimine ✅, ajalugu ✅, hinnangud ✅, ohuteated ✅; koerte põhiandmed toodud M4-st ✅. Vt [09-kulastused.md](09-kulastused.md) | Andmebaas ja äriloogika | Kaks kasutajat näevad teineteise kohalolekut õiguste järgi |
| **M4 Koerad ja tervis** 🟡 | Koera fotod: presigned upload privaatsesse S3-hoidlasse (arenduses MinIO, toodangus R2) ✅, EXIF/GPS eemaldamine ja pisipildid sharp'iga ✅, profiilipilt ✅, kaamera ja galerii ✅; privaatsed tervisekirjed ✅ ja meeldetuletused avalehel ✅. API ja CI testitud, äpp vajab uut development build'i ja simulaatoris läbiklõpsamist. Vt [10-koerad-ja-tervis.md](10-koerad-ja-tervis.md) | Kaamera, failid, privaatsus | Koera profiil fotoga, tervisekirje nähtav ainult omanikule |
| **M5 Kogukond** 🟡 | Vastastikused sõbrakutsed ja otsing ✅, 1:1 vestlused sõprade vahel ✅ (Socket.IO samas serveris, 15 s polling varuks), teavituste voog ja lugemata märk ✅, push BullMQ + Redis + expo-server-sdk saaja keeles ✅, eelistused ✅, blokeerimine (mõlemas suunas, kõikjal) ja kasutajast teavitamine ✅, sõprade plaanid avalehel ✅. API ja CI testitud; äpp vajab uut development build'i (expo-notifications), EAS projekti ID-d push-märgi jaoks ja simulaatoris/seadmes läbiklõpsamist. Vt [12-kogukond.md](12-kogukond.md) | Reaalaja andmed | Sõnum jõuab teisele kasutajale reaalajas ja push-teavitusena |
| **M6 Teenused** | Teenusepakkujad, aja valik, broneering, minu broneeringud | – | Broneeringu voog lõpuni |
| **M7 Animatsioonid ja viimistlus** | Reanimated üleminekud, jagatud elemendi animatsioonid (park → detail), haptika, tühjad olekud, ligipääsetavus (VoiceOver, Dynamic Type) | Animatsioonid, UI/UX | Põhivood on animeeritud, VoiceOver loeb kõik nupud |
| **M8 Pakendamine ja levitamine** | EAS Build profiilid, TestFlight, Google Play internal testing, API hostimine EL-is, keskkonnamuutujad, varukoopiad | Pakendamine ja levitamine | Testijad saavad äpi poest või TestFlightist alla laadida |

## Töövõtted

- **Harud:** `main` on alati töötav; töö harudes `feature/<lühike-nimi>`, liitmine Pull Requestiga.
- **Commitid:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`), lühike ja käskivas kõneviisis.
- **CI:** GitHub Actions jooksutab iga PR-i peal `npm run typecheck` ja `npm test` (`.github/workflows/ci.yml`).
- **Andmebaasi muutused:** muuda `schema.ts` → `npm run db:generate -w @kapp/api` → vaata SQL üle → `npm run db:migrate`. Migratsioone ei muudeta pärast `main`-i liitmist.
- **Expo paketid:** lisa alati `npx expo install <pakett>` (õiged SDK-ga ühilduvad versioonid).
- **Disain enne koodi:** uus vaade või komponent tehakse esmalt Figmas, tokenid sünkroonitakse `packages/shared/src/tokens.ts`-i.
