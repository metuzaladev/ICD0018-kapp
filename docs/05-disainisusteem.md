# 5. Disainisüsteem

Figma: [Käpp — Dog Park App · Design System & Screens](https://www.figma.com/design/V2HKxpEsay19chlBD4AUV4)

| Figma leht | Sisu |
|---|---|
| 01 · Foundations | Palett, tüpograafia, Apple HIG reeglid |
| 02 · Components | Button (Primary/Secondary/Tertiary/Apple/Disabled, Arrow), Input (Placeholder/Filled), List Row (vahetatav ikoon), Chip, Chip Row, Toggle Row, Bottom Navigation (Active), Screen Header, Status Bar, Home Indicator, Photo / Dog, Photo / Park, Background / Paws, ikoonid (Lucide) |
| 03 · Screens | 50 vaadet (390 × 844), tume režiim vaikimisi |
| 04 · Prototype | Prototüübi alguspunkt |
| 05 · Themes | Aktsendid Terracotta / Blue / Green / Violet heledas ja tumedas |

## Tokenid koodis

Figma muutujad on peegeldatud failis [`packages/shared/src/tokens.ts`](../packages/shared/src/tokens.ts):

| Figma | Kood |
|---|---|
| Collection **Accent** (Terracotta vaikimisi) | `accents.terracotta` jt |
| Collection **Color** (Light/Dark) | `semanticColors(scheme, accent)` → `background`, `surface`, `text`, `muted`, `border`, `brand`, `onBrand`, `link`, `soft`, `tint`, `danger` |
| Text styles **Typography/*** | `typography.hero`, `title`, `heading`, `body`, `label`, `caption`, `micro` |
| Collection **Dimensions** | `space`, `radius`, `ios.touchTargetMin` (44), `ios.screenMargin` (24) |

Äpp kasutab neid failis `apps/mobile/src/constants/theme.ts`. Aktsendi vahetamiseks muuda seal `ACCENT`.

## Reeglid (Apple Human Interface Guidelines)

- Iga puudutatav element vähemalt **44 × 44 pt**; nupud 52 pt kõrged.
- Ekraani servavahe 24 pt; turvaalad üleval 47 pt ja all 34 pt (390 × 844 kaader).
- Tekst ei ole väiksem kui **11 pt**; tekstikontrast vähemalt **4,5 : 1** nii heledas kui tumedas režiimis (Figmas kontrollitud kõigi aktsentidega).
- Tab bar: viis tab'i, ikoon + silt; põhivaadetel tagasi-nuppu pole.
- „Sign in with Apple" kasutab Apple'i ametlikku nupustiili.
- Tume režiim on põhidisain; hele režiim peab samuti töötama (`userInterfaceStyle: automatic`).

## Pildid ja litsentsid (kohatäited)

- Koerafoto: Grzegorz Wicher, *Welsh Corgi Cardigan named Flow*, CC BY-SA 4.0, Wikimedia Commons.
- Pargifoto: Diego Delso, *Parque de Kadriorg*, CC BY-SA 3.0, Wikimedia Commons.
- Kaart: © OpenStreetMapi kaastöötajad (ODbL).
- Ikoonid: Lucide (ISC).

Enne avalikku väljalaset asenda fotod omadega või lisa autorite viited äpi „Teave" vaatesse.
