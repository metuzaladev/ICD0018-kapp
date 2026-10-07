# 5. Disainisüsteem

Figma: [Käpp — Dog Park App · Design System & Screens](https://www.figma.com/design/V2HKxpEsay19chlBD4AUV4)

| Figma leht | Sisu |
|---|---|
| 01 · Foundations | Palett, tüpograafia, Apple HIG reeglid |
| 02 · Components | Button (Primary/Secondary/Tertiary/Apple/Disabled, Arrow), Input (Placeholder/Filled), List Row (ikoon või foto), Park Card, Chip, Chip Row, Toggle Row, Bottom Navigation (Active), Screen Header, Status Bar, Home Indicator, Photo / Dog, Photo / Park, Background / Paws, ikoonid (Lucide); jaotis **Explore & Rewards**: Segmented Control, Icon Button, Points Badge, Chip / Icon, Map Pin / Place, Map Pin / Dog, Streak Tile, Progress / Reward, Product Card, Feed / Place Post |
| 03 · Screens | Vaated 390 × 844, **hele režiim + roheline aktsent** (M9); jaotis „09 / Explore & Rewards" (M9b) |
| 04 · Prototype | Prototüübi alguspunkt |
| 05 · Themes | Aktsendid Terracotta / Blue / Green / Violet heledas ja tumedas |

## Tokenid koodis

Figma muutujad on peegeldatud failis [`packages/shared/src/tokens.ts`](../packages/shared/src/tokens.ts):

| Figma | Kood |
|---|---|
| Collection **Accent** (Terracotta, Blue, Green, Violet, Lime) | `accents.green` jt; igal aktsendil `base`, `light`, `soft(Dark)`, `tint(Dark)`, **`onBase`** (tekst brändivärvil) ja **`ink`** (aktsent tekstina heledal pinnal) |
| Collection **Color** (Light/Dark) | `semanticColors(scheme, accent)` → `background`, `surface`, `text`, `muted`, `border`, `brand`, `onBrand` (= `onBase`), `link` ja `accent` (heledas `ink`, tumedas `light`), `soft` (Figma `sage`), `tint`, `danger` |
| Variables **map/\*** (Light/Dark) | `mapPalette` → `mapPark`, `mapCafe`, `mapBeach`, `mapService`, `mapVet`, `mapPinInk` (ikoon kategooria värvil), `mapPinRing` (nööpnõela rõngas) |
| Text styles **Typography/*** | `typography.hero`, `title`, `heading`, `body`, `label`, `caption`, `micro` |
| Collection **Dimensions** | `space`, `radius`, `ios.touchTargetMin` (44), `ios.screenMargin` (24) |

Äpp kasutab neid failis `apps/mobile/src/constants/theme.ts`. Aktsendi vahetamiseks muuda seal `ACCENT` (M9-st **`green`**).

**Miks `onBase` ja `ink` (M9):** heleda aktsendi (lime `#C9F04A`) peal on valge tekst loetamatu ja sama värv tekstina valgel taustal samuti. Seepärast kannab iga aktsent kahte lisavärvi: tekst brändivärvi peal (`onBase`, lime'il tumeroheline) ja aktsent tekstina (`ink`, lime'il `#4F7A00`). Nelja tumedama aktsendi puhul on need valge ja `base` ise. Kontrasti kontrollib test `apps/mobile/test/tokens.test.ts` (kõik aktsendid, mõlemad režiimid, ≥ 4,5 : 1).

**Kaardivärvid** on Figma muutujad `map/*` ja ei sõltu aktsendist: kategooria (park, kohvik, rand, teenus, kliinik) peab olema äratuntav ka siis, kui aktsent vahetub. Koodis on need lamedad võtmed (`mapPark` …), et iga väärtus oleks värvistring (`ThemeColor`).

## Välimus (hele / tume)

Figma põhidisain on M9-st **hele**. Seaded → **Välimus**: *Süsteem*, *Hele* (vaikimisi), *Tume*. Valik salvestub seadmesse (`kapp.appearance`, AsyncStorage — sama põhjendus nagu keelevalikul, docs/11), loetakse enne splash-ekraani peitmist ja rakendub natiivselt `Appearance.setColorScheme` kaudu, nii et ka natiivne tab bar, päised, klaviatuur, dialoogid ja Apple'i nupp järgivad valikut. *Süsteem* annab otsuse tagasi iOS-ile (`unspecified`). Lugemise viga = hele, salvestamise viga kehtib sessiooni lõpuni (`lib/appearance.ts`, test `test/appearance.test.ts`). Kaardi stiil järgib valikut: OpenFreeMap **positron** (hele, rahulik hall alus, et värvilised nööpnõelad paistaksid) ja **dark**.

## Reeglid (Apple Human Interface Guidelines)

- Iga puudutatav element vähemalt **44 × 44 pt**; nupud 52 pt kõrged.
- Ekraani servavahe 24 pt; turvaalad üleval 47 pt ja all 34 pt (390 × 844 kaader).
- Tekst ei ole väiksem kui **11 pt**; tekstikontrast vähemalt **4,5 : 1** nii heledas kui tumedas režiimis (Figmas kontrollitud kõigi aktsentidega).
- Tab bar: viis tab'i, ikoon + silt; põhivaadetel tagasi-nuppu pole.
- „Sign in with Apple" kasutab Apple'i ametlikku nupustiili.
- Hele režiim on M9-st põhidisain; tume peab samuti töötama (`userInterfaceStyle: automatic`, Seaded → Välimus).
- Tekstiga elementidel pole fikseeritud kõrgust ega laiust: nupp `minHeight` 52, kiip `minHeight` 44 ja laius sildist (Dynamic Type kuni 160 %, pikad vene sildid). Ikooniga kiipide read (`ChipRow`) **keritakse horisontaalselt** nagu Figmas, ei murdu; tavaliste kiipide read (kellaajad, kestused, raadius, teavituse põhjus) murduvad endiselt.
- Liikumine (M7): kestused ja vedrud failis `apps/mobile/src/lib/motion.ts` (150 / 250 / 350 ms), kõik animatsioonid järgivad „Vähenda liikumist"; haptika ainult `lib/haptics.ts` kaudu. Vt [14-animatsioonid-ja-ligipaasetavus.md](14-animatsioonid-ja-ligipaasetavus.md).

## Komponendid koodis (M7)

| Figma / muster | Kood |
|---|---|
| Button (+ Arrow) | `components/button.tsx` (vajutusel kahaneb, kasvab suure tekstiga; `trailingIcon="arrow-right"`) |
| Chip | `components/chip.tsx` (kellaajad, kestused, raadius, põhjused) |
| Chip / Icon, Chip Row | `components/icon-chip.tsx` → `IconChip`, `ChipRow` (M9) |
| Segmented Control | `components/segmented-control.tsx` (kaks valikut: Tulevased/Varasemad, Isane/Emane, kirje liik) |
| Icon Button | `components/icon-button.tsx` (52 × 52, raadius 18, Solid / Glass) |
| Points Badge | `components/points-badge.tsx` — saldo `GET /me/rewards`-ist (`hooks/use-points.ts`), peidetud kuni see on teada; `onPress` → Käpad |
| Feed / Place Post | `components/place-post-card.tsx` (M9b) |
| Product Card | `components/product-card.tsx` (M9b) |
| Streak Tile, Progress / Reward | `app/rewards/index.tsx` (seeria käpad), `components/progress-bar.tsx` |
| Info Card | `components/info-card.tsx` |
| List Row (ikoon / foto) | `components/list-row.tsx` (`icon` või `photo`: 44 pt ümarnurkne foto, raadius 14), `provider-row.tsx` |
| Park Card | `components/park-card.tsx` (foto, sildiga omadused, süda, ★, sõbrad pargis) |
| „Lähim park" kaart | `components/nearest-park-card.tsx` („Oleme siin" → check-in) |
| Map Pin / Place, Map Pin / Dog | `components/map-pins.tsx` (`PlacePin`, `DogPin`), loogika `lib/map-categories.ts` |
| Photo / Dog (ümarnurkne) | `components/photo-tile.tsx` (foto või algustäht / käpp) |
| Icon / * (Lucide) | `components/icon.tsx` + `icon-sources.ts`, SVG-d kaustas `assets/icons` |
| Empty State / Meetups | `components/empty-state.tsx` |
| Offline State („Proovi uuesti") | `components/error-state.tsx`, `offline-banner.tsx` |
| — (laadimine) | `components/skeleton.tsx` |
| — (õnnestumine) | `components/success-mark.tsx` |

## Pildid ja litsentsid (kohatäited)

- Koerafoto: Grzegorz Wicher, *Welsh Corgi Cardigan named Flow*, CC BY-SA 4.0, Wikimedia Commons.
- Pargifoto: Diego Delso, *Parque de Kadriorg*, CC BY-SA 3.0, Wikimedia Commons.
- Näidiskoerad (`apps/mobile/assets/images/sample-dogs/`, tutvustusvaadetes — sissejuhatuse kaart ja kollaaž, registreerumise riba — ning Poe teenusekategooriate plaatidel illustratsioonina; mitte kunagi päris kasutaja ega partnerina): Unsplash License (tasuta kasutus, viidet ei nõuta). Allikad: luna `photo-1583511655857-d19b40a7a54e`, rex `photo-1530281700549-e82e7bf110d6`, charlie `photo-1543466835-00a7907e9de1`, pug `photo-1517849845537-4d257902454a`, aussie `photo-1587300003388-59208cc962cb`, bella `photo-1552053831-71594a27632d` (images.unsplash.com). Samad fotod on Figmas.
- Koerapargid: **koertepargid.ee** („Koertepargid Eestis“ — avalik kaart „Koerteplatsid Eestis“ ja parkide lehed), kogutud 2026-10-05 faili `apps/api/src/db/data/koertepargid.json` (71 kohta üle Eesti: 63 koeraparki ja 8 koerte ujumiskohta, 54-l on aadress ja omadused). Võetud **ainult faktid** — nimi, koordinaadid, aadress, maakond, suurus, eraldi ala väikestele koertele, pinnas, parkimine, valgustus, istumisala, prügikastid. Saidi kirjeldustekste, fotosid ega arvustusi ei kopeeritud; pargi kirjeldus äpis on kirjutatud faktidest (`apps/api/src/db/park-import.ts`). Saidil puudub litsents ja EL-i andmebaasiõigus kaitseb kogumit tervikuna, seega **enne avalikku väljalaset küsi omaniku luba** (info@koertepargid.ee) ja lisa viide äpi „Teave“ vaatesse. Eeldused: „koertepark“ on piiratud ala (aiaga), ujumiskoht ei ole; `water` tähistab ujumiskohta (allikal pole joogivee välja); tundmatu valgustus/eraldi ala = ei näidata. „Viimsi koertepark“ kaardil ja „Haabneeme koertepark“ lehel on sama park (200 m, Heldri tee) — ühendatud. Kogumine: robots.txt lubab, 1 päring sekundis, identifitseeritud User-Agent.
- Kaart: © OpenStreetMapi kaastöötajad (ODbL).
- Ikoonid: Lucide (ISC), `lucide-static` 1.49 SVG-failid kaustas `apps/mobile/assets/icons`.

## Ikoonid (M9)

Lucide'i SVG-d on äpis varadena (`assets/icons/*.svg`, valge joon) ja `Icon` joonistab need `expo-image`'iga, värv tuleb `tintColor`-ist — sama võte nagu käpajälgede taustal. Miks mitte `lucide-react-native`: see vajab `react-native-svg`-d, mis on **natiivne moodul** (uus development build); `expo-image` on juba olemas. Uue ikooni lisamine: kopeeri SVG `lucide-static`-ist, asenda `stroke="currentColor"` → `stroke="#FFFFFF"` ja lisa rida faili `components/icon-sources.ts`. Ikoon on alati dekoratiivne; silt on ümbritseval nupul.

Enne avalikku väljalaset asenda fotod omadega või lisa autorite viited äpi „Teave" vaatesse.
