# 1. Tehnoloogiate uuring

Kuupäev: 01.10.2026 · Kursus: ICD0018 Hübriidmobiilirakendused (TalTech)

Eesmärk: valida Käpa jaoks tehnoloogiad, mis

- võimaldavad ühe koodibaasiga iOS-i ja Androidi äppi (kursuse nõue: hübriid- või platvormiülene raamistik);
- kannavad vähemalt 1000+ aktiivset kasutajat koos piltide, asukohapäringute, sõnumite ja teavitustega;
- on õpitavad ühe arendaja poolt ühe semestri jooksul;
- ei sea projekti sõltuvusse ühest suletud platvormist.

## 1.1 Mobiiliraamistik

| Kriteerium | React Native + Expo | Flutter | Ionic + Capacitor | Cordova |
|---|---|---|---|---|
| Keel | TypeScript | Dart | TypeScript + veebiraamistik | JavaScript |
| UI | Päris natiivsed komponendid (UIKit/SwiftUI, Android View/Compose) | Oma renderdusmootor (Impeller) | WebView | WebView |
| iOS-i välimus (Apple HIG) | Natiivsed tab'id, Liquid Glass, SF Symbols otse (`expo-router` NativeTabs, `@expo/ui`) | Tuleb jäljendada (Cupertino vidinad) | Tuleb jäljendada CSS-iga | Tuleb jäljendada CSS-iga |
| Kaardid, kaamera, asukoht, teavitused | Expo SDK moodulid + MapLibre RN | Pluginad olemas | Capacitori pluginad | Vananenud pluginad |
| Ehitus ja levitamine | EAS Build/Submit/Update (pilves, OTA uuendused) | Kohalik või Codemagic | Kohalik / Appflow | Kohalik |
| Sama keel serveriga | Jah (Node.js) | Ei | Jah | Jah |
| Seis 2026 | Aktiivne; Expo SDK 57 (RN 0.86), SDK 58 beeta | Aktiivne | Aktiivne | Hääbuv |

**Valik: React Native + Expo.** Põhjused: disain järgib Apple HIG-i ja React Native kasutab päris natiivseid komponente (iOS-i tab bar, lülitid, menüüd), mitte jäljendusi; TypeScript nii äpis kui serveris võimaldab jagada tüüpe ja valideerimist; EAS katab kursuse viimase etapi (pakendamine ja levitamine) ilma Android Studiota.

## 1.2 Taustasüsteem

| Valik | Plussid | Miinused | Otsus |
|---|---|---|---|
| Supabase | Kiire algus, Postgres, auth ja failid ühes | Õigusloogika RLS-reeglites (kerge eksida), tasuta projekt pausitakse, hind hüppab andmeliiklusega, kolimine raske | Ei |
| Firebase | Küps, push ja auth valmis | NoSQL teeb seosed (koer → omanik → sõbrad → külastused) tülikaks, asukohapäringud kohmakad | Ei |
| Laravel (PHP) | Väga produktiivne, Filament admin | Teine keel lisaks TypeScriptile | Ei |
| **Node.js (Fastify) + PostgreSQL/PostGIS** | Üks keel, jagatud Zod-skeemid, täielik kontroll, PostGIS asukohapäringuteks | Auth, failid ja reaalaja osa tuleb ise kokku panna | **Jah** |

Märkus kursuse kohta: ICD0018 õppekava nimetab NoSQL andmebaase (Supabase/Firestore). Käpp kasutab relatsioonilist Postgres't, sest andmed on tugevalt seotud. **Kinnita juhendajaga, et oma API + Postgres on lõputööks aktsepteeritav.**

## 1.3 Valitud teegid ja nende sobivus

Versioonid kontrollitud npm-ist 01.10.2026.

| Osa | Teek | Versioon | Sobivus | Kontrollitud praktikas |
|---|---|---|---|---|
| Äpi raamistik | Expo SDK | 57.0.26 (React Native 0.86.3, React 19.2.3) | Uusim stabiilne SDK, New Architecture vaikimisi | ✅ tüübikontroll, lint, `expo-doctor` 21/21, iOS-i bundle, käivitus iOS 26.5 simulaatoris |
| Navigeerimine | Expo Router + NativeTabs | 57.0.24 | Failipõhine marsruutimine, natiivne iOS-i tab bar (SF Symbols) | ✅ 4 tab'i töötavad |
| Server | Fastify | 5.12.5 | Toetab Node 20+; kiire, TypeScripti-sõbralik, plugin'id (cors, helmet, rate-limit) | ✅ `/health`, `/api/v1/parks/nearby`, `/api/v1/parks/:parkId`, `POST /api/v1/parks` |
| Andmebaas | PostgreSQL 17 + PostGIS 3.5 | Docker `imresamu/postgis:17-3.5` | Ametlikul `postgis/postgis` pildil puudub arm64 (Apple Silicon); imresamu on sama projekti multi-arch build | ✅ käivitatud |
| ORM ja migratsioonid | Drizzle ORM + drizzle-kit | 0.45.3 / 0.31.11 | Toetab PostGIS `geometry(point)` tüüpi ja GiST-indekseid; PostGIS-i laiendus tuleb luua käsitsi migratsioonis | ✅ 2 migratsiooni, 25 tabelit, kauguspäring `ST_DWithin` |
| Valideerimine | Zod | 4.6.5 | Sama skeem äpis ja serveris (`packages/shared`) | ✅ päringu valideerimine + testid |
| Testid | Vitest | 5.0.3 | Jestiga sama API, ESM/TypeScript ilma seadistuseta; Fastify `inject()` ilma võrguta | ✅ 59 unit/HTTP testi + 4 integratsioonitesti |
| Autentimine | Better Auth + `@better-auth/expo` | 1.7.7 | Ametlik Expo integratsioon; Apple (ID token), Google, e-post; Drizzle adapter | ⏳ M1 |
| Kaart | MapLibre React Native | 11.4.1 | v11 toetab ainult New Architecture'it, vajab RN ≥ 0.80 ja Expo ≥ 54 → sobib SDK 57-ga. **Ei tööta Expo Go's**, vajab development build'i | ⏳ M2 |
| Kaardiplaadid | OpenFreeMap (alternatiiv MapTiler) | – | Tasuta, ilma API võtmeta, kommertskasutus lubatud; teenus „as-is", seega tootmises varuplaan (MapTiler või oma server). OpenStreetMapi enda plaadiserverid äppides keelatud | ⏳ M2 |
| Pildid | sharp + Cloudflare R2 (S3 API) | 0.35.5 | Pisipildid serveris, R2-l andmeliiklus tasuta | ⏳ M4 |
| Taustatööd | BullMQ + Redis | 6.3.11 | Pilditöötlus, teavitused, kohaloleku aegumine | ⏳ M3 |
| Reaalaja | Socket.IO | 4.8.4 | Sõnumid ja kohalolek | ⏳ M5 |
| Push-teavitused | expo-server-sdk | 7.2.0 | Üks API iOS-ile ja Androidile | ⏳ M5 |
| Andmepäringud äpis | TanStack Query | 5.104.0 | Vahemälu, uuesti laadimine, offline-olek (disainis „Offline State") | ⏳ M2 |

## 1.4 Keskkond

- **Node.js:** arvutis 22.14 (Maintenance LTS kuni 04/2027). Soovitus: uuenda Node 24 peale (Active LTS kuni 10/2026, EOL 04/2028). Projekt nõuab `>=22.12`.
- **iOS:** Xcode olemas, simulaator iOS 26.5 töötab.
- **Android:** Android Studio puudub. Androidi testimiseks paigalda Android Studio või kasuta EAS Build'i + päris seadet.
- **Docker:** 28.3, vajalik andmebaasi ja Redise jaoks.

## 1.5 Riskid ja leevendused

| Risk | Mõju | Leevendus |
|---|---|---|
| MapLibre vajab development build'i | Expo Go's kaart ei tööta | M2-s üleminek `npx expo run:ios` / `eas build --profile development` peale |
| OpenFreeMap on tasuta „as-is" teenus | Kaart võib kaduda | Stiili URL konfiguratsioonis, vahetatav MapTileri vastu |
| Tervise- ja asukohaandmed on tundlikud (GDPR) | Õiguslik ja usaldusrisk | Õiguste kontroll serveris, tervisekirjed ainult omanikule, kohalolek aegub, hostimine EL-is |
| Kasutajate sisu (sõnumid, pildid, teavitused) | Väärkasutus | Teavita/blokeeri voog on disainis olemas; serveris modereerimisjärjekord |
| App Store'i nõue | Tagasilükkamine | Google'i sisselogimisega koos peab olema „Sign in with Apple" |
| Üks arendaja, palju funktsioone | Ajapuudus | Arendusplaan (dok 04) on prioriteedi järjekorras; M1–M3 + M8 on miinimum kaitsmiseks |

## Allikad

- [ICD0018 Hübriidmobiilirakendused — TalTech ÕIS](https://ois2.taltech.ee/uusois/aine/ICD0018)
- [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57), [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56)
- [Expo Router native tabs](https://docs.expo.dev/router/advanced/native-tabs/)
- [Fastify LTS](https://fastify.dev/docs/v5.8.x/Reference/LTS)
- [Drizzle: PostGIS geometry point](https://orm.drizzle.team/docs/guides/postgis-geometry-point)
- [Better Auth: Expo integration](https://better-auth.com/docs/integrations/expo), [Better Auth: Apple](https://better-auth.com/docs/authentication/apple)
- [Expo Apple Authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [MapLibre React Native: getting started](https://maplibre.org/maplibre-react-native/docs/setup/getting-started)
- [OpenFreeMap](https://openfreemap.org)
- [Node.js 22 vs 24 (2026)](https://dev.to/royce_fabbd83cb268312e928/node-22-vs-node-24-in-2026-current-lts-upgrade-guide-1oa5)
