# 14. Animatsioonid, haptika ja ligipääsetavus (M7)

See dokument kirjeldab, kuidas äpp liigub, millal see vibreerib ja kuidas see töötab VoiceOveri ning suure tekstiga. Uus vaade järgib samu reegleid; `npm run a11y:check` ja `npm run i18n:check` kontrollivad osa neist CI-s.

## Teegid

| Teek | Milleks | Miks see |
|---|---|---|
| `react-native-reanimated` 4.5 (oli juba Expo mallis) | Layout-animatsioonid (`entering`), vajutuse ja kiibi animatsioon | Jookseb UI-lõimel, Expo SDK 57-ga kaasas, uut natiivset moodulit pole vaja. |
| `expo-haptics` (**uus natiivne moodul**) | Haptiline tagasiside | Expo ametlik moodul, iOS Taptic Engine ja Androidi vibraator ühe API-ga. **Vajab uut development build'i** (`npx expo run:ios`). |

## Liikumise põhimõtted

Apple HIG „Motion": liikumine on lühike, eesmärgiga ega blokeeri kunagi sisendit. Tokenid on failis `apps/mobile/src/lib/motion.ts` (puhtad numbrid, unit-testitud).

| Token | Väärtus | Kus |
|---|---|---|
| `Durations.quick` | 150 ms | Kiibi värvi vahetus |
| `Durations.standard` | 250 ms | Sisu ilmumine (`Entering`) |
| `Durations.emphasized` | 350 ms | Ainus „tähelepanu" hetk: õnnestumise märk |
| `STAGGER_MS` / `MAX_STAGGERED_ROWS` | 40 ms / 6 rida | Nimekirja read ilmuvad järjest; alates 7. reast koos, et pikk nimekiri ei venitaks |
| `PRESS_SCALE` + `PRESS_SPRING` | 0,97, kriitiliselt summutatud vedru | Vajutatud nupp/rida/kiip |
| `POP_SPRING` | üks pehme üleviske | Õnnestumise märk, lemmiku süda |

| Komponent | Mida teeb |
|---|---|
| `components/pressable-scale.tsx` | Iga nupu, kiibi ja rea alus: vajutamisel kahaneb 3 % ja tuhmub. |
| `components/chip.tsx` | Valik vahetab värvi sujuvalt (`interpolateColor`) ja annab valiku-haptika. |
| `components/entering.tsx` | Andmete saabumisel tõuseb sisu 12 pt ja ilmub (`FadeInDown`); ainult paigaldamisel, mitte iga refetch'i peale. |
| `components/skeleton.tsx` | Laadimise kohatäide („Laen…" teksti asemel) pehme pulsiga; VoiceOver kuuleb ühte elementi „Laen…". |
| `components/success-mark.tsx` | Check-in'i ja broneeringu õnnestumine: brändivärvi linnuke hüppab sisse. Dekoratiivne (pealkiri ütleb sama). |
| `components/screen.tsx` → `refresh` | Tõmba-värskendamiseks (`hooks/use-pull-to-refresh.ts`) nimekirjadel, mille andmed võivad vaate lahti olles muutuda. |

### Pargi rida → pargi detail

Ülesanne nägi ette jagatud elemendi üleminekut (shared element transition). **Seda ei kasutata.** Reanimated 4.5-s on `sharedTransitionTag` staatilise lipu `ENABLE_SHARED_ELEMENT_TRANSITIONS` taga (`package.json` → `reanimated.staticFeatureFlags`): see nõuab natiivset ümberehitust, ei tohi olla koos lipuga `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` (`scripts/reanimated_utils.rb`) ja on endiselt eksperimentaalne. Pargi lehel on ka läbipaistev natiivne päis ja keritav sisu, kus jagatud elemendi kaadri arvutus on teadaolevalt habras.

Asendus: natiivse stacki push (iOS-i libisemine) annab ruumilise seose, rida kahaneb vajutamisel, pargi pilt ja pealkiri settivad `Entering`-uga (indeksid 0 ja 1). Kui Reanimated'i jagatud üleminekud muutuvad stabiilseks ilma lipuita, saab `ParkRow` ja pargi pildi siduda ühe `sharedTransitionTag`-iga.

### Vähendatud liikumine (Reduce Motion)

- `hooks/use-reduce-motion.ts` loeb `AccessibilityInfo.isReduceMotionEnabled()` ja kuulab `reduceMotionChanged`. Reanimated'i `useReducedMotion` loeb seadet ainult äpi käivitumisel (vt selle lähtekoodi), seega töö ajal muudetud seade jääks märkamata.
- Kui see on sees: `Entering` ja `SuccessMark` joonistavad lõppseisu ilma animatsioonita, kiibi värv vahetub kohe (`motionDuration` → 0), vajutus ainult tuhmub (läbipaistvus ei ole liikumine), skeleton ei pulseeri, onboarding'u „Edasi" kerib ilma animatsioonita, kaardi kaamera hüppab (`duration: 0`), lemmiku süda ei hüppa.
- Lisaks on igal Reanimated'i animatsioonil `ReduceMotion.System` (vaikimisi), nii et ka unustatud kontroll ei animeeri.

## Haptika

Ainult failis `apps/mobile/src/lib/haptics.ts` (`haptic(reason)`); ekraan nimetab põhjuse, mitte mustri. Haptika on tagasiside, mitte info: kõik, mida see annab märku, on ka nähtav ja VoiceOveriga kuuldav. Viga (pole Taptic Engine'i, Low Power Mode) ignoreeritakse.

| Põhjus | Muster | Kus |
|---|---|---|
| `selection` | `selectionAsync` | Kõik kiibid (filtrid, kestused, kuupäevad, kategooriad, Tulevased/Varasemad), tärnid, teenuse valik, keelevalik, lemmiku süda |
| `success` | Success | Check-in, broneering kinnitatud, hinnang salvestatud, plaan salvestatud |
| `warning` | Warning | Vahetult enne hävitava tegevuse kinnitust: broneeringu tühistamine, koera / tervisekirje / foto kustutamine, sõbra eemaldamine, blokeerimine |
| `error` | Error | Server lükkas check-in'i, broneeringu, hinnangu või plaani tagasi |

Natiivsed vahekaardid (`NativeTabs`) haptikat ei saa: iOS-i süsteemne tab bar ei vibreeri ja HIG ei soovita süsteemse käitumise muutmist.

## Tühjad, laadimise ja vea olekud

| Olek | Komponent | Reegel |
|---|---|---|
| Laadib, andmeid pole | `SkeletonList` | Ridade kuju ja kõrgus nagu päris sisul, et paigutus ei hüppaks. |
| Tühi | `EmptyState` | Pealkiri (+ lause) ja võimalusel järgmine samm (Figma „Empty State / Meetups"). Pealkiri ja tekst on üks VoiceOveri element. |
| Viga, puhvris pole midagi | `ErrorState` | Serveri teade (kasutaja keeles) + „Proovi uuesti" (Figma „Offline State"), loetakse ette kui alert. |
| Viga, puhvris on andmed | `FormError` | Puhverdatud andmed jäävad nähtavaks (offline), teade ülal. |

Auditeeritud vaated: avaleht, kaart, pargi leht, check-in, plaan, hinnang, teavitus, külastused, lemmikud, koerad, koera profiil, tervis, fotod, sõbrad, kasutaja profiil, sõnumid, teated, teenused, pakkuja, broneerimine, minu broneeringud, seaded, privaatsus, teavituste seaded, kutse parki. `invite-park` näitas varem „Laen…" igavesti, kui parke polnud.

## Ligipääsetavuse reeglid

1. **Iga puudutatav element** (`Pressable`, `PressableScale`, `Touchable*`) omab `accessibilityRole` ja `accessibilityLabel` (ja `accessibilityHint`, kui tulemus pole sildist selge: „Avab pargi lehe", „Avab filtrid"). Silt on kõigis kolmes keeles (`t()`).
2. **Rida on üks element.** `ListRow`, `ParkRow`, `ProviderRow`, külastaja, koer, plaan, külastus ja arvustus loetakse ühe lausena („Kadrioru koerapark, 1,2 km · 6 koera praegu"); nupud kaardi sees jäävad eraldi. Noolekesed `›` ja märgid on peidetud.
3. **Ainuvalik** on `accessibilityRole="radiogroup"` + kiibid `role="radio"` (`checked`): kestus, kohalolu nähtavus, teavituse põhjus, kirje liik, keel, teenus. Lülituvad kiibid on nupud olekuga `selected`.
4. **Hinne** on üks `adjustable` element (VoiceOveris pühkimine üles/alla muudab), mitte viis eraldi nuppu.
5. **Pildid** on sildiga või peidetud (`accessible={false}`): taust, avatarid ja pakkuja foto on dekoratsioon; pargi ja koera foto on sildiga.
6. **Teated:** õnnestumine kuulutatakse (`announceForAccessibility`: „Kohalolek märgitud…", „Hinnang salvestatud…"), vead on `alert` + `accessibilityLiveRegion`.
7. **Pealkirjad** (`accessibilityRole="header"`) ekraani pealkirjal ja jaotistel, et rootoriga saaks hüpata.
8. **Dynamic Type:** `ThemedText` lubab kuni 160 % (`maxFontSizeMultiplier={1.6}`, et 390 pt paigutus jääks kasutatavaks). Tekstiga konteineritel pole fikseeritud kõrgust (`minHeight`), nupud (`Button` ≥ 52 pt) ja kiibid (≥ 44 pt) kasvavad, kiipide read murduvad (`flexWrap`), kiibi laius tuleb sildist (pole `flex: 1` ega fikseeritud laiust — „Отправить", „Фильтры (2)"), kellaaja kiibid on `minWidth`, mitte `width`.
9. **Puutepind ≥ 44 × 44 pt** (HIG); päise süda 44 pt, tärnid 52 pt.
10. **Kontrast:** värvid tulevad ainult Figma tokenitest (`semanticColors`), mida on Figmas kontrollitud 4,5 : 1 heledas ja tumedas kõigi aktsentidega (docs/05). Uut värvi koodis ei looda.

### Automaatne kontroll

`npm run a11y:check` (`scripts/a11y-check.ts`, reeglid `scripts/a11y-rules.ts`, testid `scripts/a11y-rules.test.ts`, CI-s pärast i18n kontrolli):

- puudutatav element ilma rolli või sildita;
- `Switch` / `TextInput` ilma sildita;
- `Image` ilma sildita, mis pole peidetud ega asu sildiga elemendi sees.

Laialilaotusega (`{...rest}`) element on edasiandja ja seda kontrollitakse kasutuskohas. Teadlik erand: kommentaar `a11y-ignore: <põhjus>` elemendi kohal (põhjus on kohustuslik). Staatiline kontroll ei näe lugemise järjekorda, kontrasti ega suurt teksti — need on käsitsi.

## Kuidas testida

**VoiceOver (iOS simulaator või seade):** Seaded → Hõlbustus → VoiceOver (simulaatoris Accessibility Inspector: Xcode → Open Developer Tool). Kontrolli igal vaatel: kõik nupud loetakse sildiga ja rolliga, rida on üks peatus, kiibi valik ütleb „valitud", hinne muutub pühkimisega, check-in'i järel kõlab „Kohalolek märgitud".

**Suur tekst:** Seaded → Hõlbustus → Ekraan ja teksti suurus → Suurem tekst → maksimum (simulaatoris Accessibility Inspector → Font size). Kontrolli kõigis kolmes keeles (vene on pikim): tekst ei lõiku ega kattu, nupud kasvavad, kiibid murduvad uuele reale.

**Vähendatud liikumine:** Seaded → Hõlbustus → Liikumine → Vähenda liikumist. Ükski loend, märk ega kaart ei tohi animeeruda; lüliti muutmine äpi töö ajal peab kehtima kohe.

**Haptika** on tuntav ainult päris seadmes (simulaator ei vibreeri).

**Unit-testid:** `npm test` jooksutab ka `apps/mobile/test` (haptika, liikumise tokenid, onboarding'u lipp; Vitest, natiivsed moodulid mock'itud) ja `scripts` (a11y reeglid).

## Onboarding

Figma „Onboarding / Discover" ja „Connect" näidatakse **üks kord**, väljalogitud seadme esimesel käivitusel enne Welcome'i (`app/(auth)/onboarding.tsx`). Lipp `kapp.onboardingSeen` on AsyncStorage'is (`lib/onboarding.ts`): pole saladus ja SecureStore'i kirje elaks üle äpi uuesti paigaldamise. Lipp loetakse enne splash'i peitmist, seega Welcome ei vilksata. Lugemise viga = „nähtud" (intro on valikuline, igal käivitusel kordamine oleks hullem); salvestamise viga kehtib sessiooni lõpuni. Sisse loginud kasutajale märgitakse intro nähtuks. Figma erinevused: [docs/11](11-tolked-ja-figma.md#teadlikud-erinevused-figmast).

## Mida pole kontrollitud

Arenduskeskkonnas polnud iOS-i simulaatorit: animatsioone, haptikat, VoiceOveri järjekorda, suurt teksti ja onboarding'u voogu pole seadmes nähtud. Kontrollitud on `tsc`, lint, unit-testid, `i18n:check` ja `a11y:check`. `expo-haptics` vajab uut development build'i.
