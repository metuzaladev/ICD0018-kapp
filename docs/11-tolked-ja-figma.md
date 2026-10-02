# 11. Tõlked (et/en/ru) ja Figma tekstid

Äpp ja API räägivad kolmes keeles: **eesti** (lähtekeel ja varukeel), **inglise** ja **vene**. Eestikeelsete tekstide allikas on Figma eksport [`docs/figma/copy-et.json`](figma/copy-et.json); kõik teadlikud erinevused sellest on [tabelis allpool](#teadlikud-erinevused-figmast).

> **Inglis- ja venekeelsed tekstid vajavad emakeelse kõneleja ülevaatust.** Need on kirjutanud arendaja, mitte tõlkija; tooni ja terminoloogia (nt koeraomanike kõnepruuk vene keeles) peab enne avalikku väljalaset üle vaatama.

## Teegid ja miks

| Teek | Milleks | Miks see |
|---|---|---|
| `i18next` + `react-i18next` | Äpi tõlked, `t()` ja `useTranslation()` | Mitmuse vormid tulevad `Intl.PluralRules`-ist (vene keel vajab *one/few/many*, eesti ja inglise *one/other*); `useTranslation` joonistab ekraani keele vahetusel uuesti; laialt kasutatud ja hooldatud. Võtmed on tüübikontrollitud `et.json` vastu (`src/i18n/i18next.d.ts`) — vale võti on `tsc` viga. |
| `expo-localization` | Seadme keel(ed), iOS/Androidi rakendusepõhine keel | Expo ametlik moodul; config plugin deklareerib toetatud keeled (`supportedLocales`), nii saab kasutaja iOS-i/Androidi seadetes valida äpile eraldi keele. |
| `@react-native-async-storage/async-storage` | Kasutaja keelevalik seadmes | Valik ei ole saladus. SecureStore (Keychain) on mõeldud volitustele ja jääb alles ka pärast äpi kustutamist; AsyncStorage on tavaline seadmepõhine võti-väärtus hoidla. |
| `Intl` (Hermes) | Kuupäevad, kellaajad, arvud | Standardne, keelepõhine vorming ilma lisateegita (`src/lib/format.ts`). |

API ja jagatud valideerimine ei kasuta i18nexti: `packages/shared/src/i18n` on väike sõltuvusteta tabel + `translate(language, key, params)`, sest serveris on vaja ainult veateateid ja sama kood peab töötama ka äpis.

## Kuidas keel valitakse

- **Äpp:** seadme eelistatud keelte loendist esimene toetatud keel (`et`, `en`, `ru`), muidu eesti. Seadetes („Sinu Käpp." → **Keel**) saab valida *automaatne* (järgib seadet, ka Androidi keelevahetust äpi töötamise ajal), *eesti*, *English* või *русский*. Keelte nimed on endonüümid ja igas keeles samad, et igaüks leiaks oma keele. Valik salvestub seadmesse (`kapp.language`), kehtib ka sisselogimisekraanidel ja laaditakse enne splash-ekraani peitmist, et vale keel ei vilksataks.
- **API:** iga päring kannab päist `Accept-Language` (`lib/api.ts` ja Better Authi kliendi `fetchOptions.onRequest`). Server valib keele `parseAcceptLanguage`-iga: suurim `q`, võrdse `q` korral päise järjekord, piirkonnaga sildid vastavad keelele (`ru-RU` → `ru`), `q=0` tähendab „ei sobi", tundmatu, `*` või puuduv → eesti.
- **iOS-i õiguste tekstid** (asukoht, pildid, kaamera) on tõlgitud failides `apps/mobile/src/i18n/native/{et,en,ru}.json` (`app.json` → `locales`, `CFBundleAllowMixedLocalizations`). Eestikeelsed on samad, mis config pluginates (vaikimisi `Info.plist`). Androidil õiguse dialoogi tekst on süsteemi oma.

## Võtmed

**Äpp** (`apps/mobile/src/i18n/locales/{et,en,ru}.json`): pesastatud JSON, rühmitatud ekraani või valdkonna järgi.

| Rühm | Näide | Sisu |
|---|---|---|
| `common.*` | `common.loading` | Korduvad sõnad (Laen…, Salvesta, Loobu, Kustuta) |
| `units.*`, `counts.*`, `dates.*` | `counts.dogs_one` | Ühikud ja arvuga nimisõnad (mitmuse vormid), kuupäevasõnad |
| `errors.*` | `errors.network` | Äpi enda veateated (võrk, üleslaadimine) |
| `tabs.*`, `nav.*` | `nav.checkIn` | Vahekaartide ja natiivse päise pealkirjad |
| `<ekraan>.*` | `auth.signIn.title`, `park.dogsNow_other`, `health.edit.clinic` | Ekraani tekstid, ligipääsetavuse sildid ja vihjed |

Mitmus: võti + i18nexti järelliide (`_zero`, `_one`, `_few`, `_many`, `_other`) ja kutse `t('counts.dogs', { count })`. `_zero` on valikuline (nt „Praegu on pargis vaikne."), aga kui see on ühes keeles, peab see olema kõigis. Arvuga nimisõnu ei liideta koodis kunagi käsitsi („1 fotot" viga) — selleks on `dogsLabel`, `photosLabel`, `reviewsLabel`, `visitsLabel`, `ageLabel`, `dueLabel` failis `lib/format.ts`.

**Jagatud tabelid** (`packages/shared/src/i18n/{et,en,ru}.ts`): lamedad võtmed.

| Rühm | Kasutaja |
|---|---|
| `validation.*` | Zodi skeemide tekstid (`issueMessage('validation.minChars', { min: 8 })`), üldtekstid veakoodi kaupa, lause „Väli "x" …" |
| `errors.*` | API `HttpError`-id, Fastify parseri vead, 404/429/500/503 |
| `auth.*` | Better Authi koodide tõlked (`modules/auth/auth-errors.ts`) |

`en.ts` ja `ru.ts` on tüübiga `Messages = Record<MessageKey, string>`, seega puuduv või üleliigne võti on kompileerimisviga.

Parameetrid on mõlemas kohas kujul `{{nimi}}`. Pargi- ja koeranimesid **ei käänata**: lause ehitatakse nii, et nimi seisab nimetavas („Kustutada koer {{name}}?", mitte „Kustutada {{name}}?").

## Kuidas lisada tekst

1. Lisa võti `apps/mobile/src/i18n/locales/et.json` õigesse rühma (eestikeelne tekst Figmast, kui see seal on).
2. Lisa sama võti `en.json` ja `ru.json` (venes vajadusel `_one/_few/_many/_other`).
3. Kasuta: `const { t } = useTranslation();` ja `t('rühm.võti', { param })`. Väljaspool Reacti (lib-failid) `i18n.t(...)` failist `@/i18n`.
4. `npm run i18n:check` ja `npx tsc --noEmit` (apps/mobile) näitavad puuduvat võtit, parameetrit või kõvakodeeritud teksti.

Validatsiooni- või API-teade: lisa võti kõigisse kolme faili `packages/shared/src/i18n/`, skeemis `issueMessage('validation.x')`, teenuses `throw new NotFoundError('errors.x')`.

## Kuidas lisada keel

1. `packages/shared/src/i18n/`: uus fail (nt `fi.ts`, tüüp `Messages`), lisa `LANGUAGES` ja `MESSAGES` hulka.
2. `apps/mobile/src/i18n/locales/fi.json` ja `native/fi.json`; `resources` ja `LOCALE_TAG` failis `src/i18n/index.ts`; `app.json` → `locales` ja `expo-localization` → `supportedLocales`; `settings.languageNames.fi` kõigisse faili.
3. `scripts/i18n-check.ts` → `LANGUAGES`. Kontroll nõuab uue keele mitmuse vorme `Intl.PluralRules` järgi.

## API veateated

Vastuse kuju jääb **täpselt** `{ error: true, message }` ([06-koodistandard.md](06-koodistandard.md#63-vigade-leping)); muutub ainult `message` keel.

- `HttpError` ja alamklassid võtavad **võtme ja parameetrid**, mitte teksti: `throw new ConflictError('errors.dogLimit', { max: MAX_DOGS_PER_USER })`. Võtme tüüp on `MessageKey`, seega eestikeelset teksti ei saa enam teenusesse kirjutada.
- `error-handler.ts` tõlgib vea päringu `Accept-Language` järgi (`requestLanguage`): `HttpError.localize(language)`, Fastify parseri vead, andmebaasi katkestus (503), tundmatu viga (500), tundmatu aadress (404), rate limit (429).
- Valideerimine: `parseRequest` viskab `ValidationError`, mis hoiab Zodi viga ja kirjeldab seda alles siis, kui käsitleja keele teab (`describeFirstIssue(error, part, language)`).
- Auth: `translateAuthError(status, body, language)` failis `modules/auth/auth-errors.ts`; proxy annab keele päisest.
- **Serveri logi on inglise keeles:** `Error.message` on alati ingliskeelne tõlge ja 4xx logirida kasutab ingliskeelset teksti, mida klient ka ei küsiks.
- Andmeid (pargi nimed, kirjeldused) ei tõlgita.

## CI kontrollid

`npm run i18n:check` (`scripts/i18n-check.ts`, käivitub `.github/workflows/ci.yml`-is):

1. **Tabelid:** äpi kolm locale-faili, natiivsed õiguste tekstid ja jagatud sõnumitabelid — samad võtmed, samad `{{param}}`-id, iga keele nõutud mitmuse vormid (`Intl.PluralRules`), tühje väärtusi pole. Sama kontroll on ka testis `apps/api/test/unit/i18n-messages.test.ts`, nii et ka `npm test` kukub.
2. **Kõvakodeeritud tekst** `apps/mobile/src`-is väljaspool `src/i18n` (TypeScripti süntaksipuu, kommentaarid ei loe):
   - stringiliteraal või JSX-tekst eesti (õäöüšž) või kirillitsa tähtedega;
   - igasugune tähti sisaldav JSX-tekst (kõik nähtav käib läbi `t()`);
   - tähti sisaldav literaal kasutajale nähtavas propis või valikus (`title`, `label`, `placeholder`, `accessibilityLabel`, `accessibilityHint`, Alerti nupu `text` jne). Tõlkevõti (`'health.vaccinations'`) on lubatud.
   - Lubatud erandid (`ALLOWED`): brändinimi `käpp`, `© OpenStreetMap`.

`npm run a11y:check` (M7) kontrollib, et nupud, lülitid, väljad ja pildid on VoiceOverile sildistatud; sildid ise käivad läbi `t()` ja on seega kolmes keeles. Vt [14-animatsioonid-ja-ligipaasetavus.md](14-animatsioonid-ja-ligipaasetavus.md).

## Vene keele pöördumine

**„Вы" (viisakas, väikese tähega).** Põhjus: Tallinna venekeelsed kasutajad on igas vanuses ja tundmatult teenuselt mõjub „ты" vene keeles liiga familiaarselt; „вы" on avalike teenuste ja enamiku Eesti äppide vene keeles tavaline. Soojus tuleb sõnavalikust („хвостатые", „стая", „Гулять, Freddy?"), mitte pöördumisest. Eesti keeles jääb Figma „sina".

Inglise keel: loomulik, soe ja lühike, mitte sõnasõnaline („Õue, Freddy?" → „Walkies, Freddy?", „Minu käpalised" → „My furry friends"). Briti kirjaviis (*favourite*), 24 h kell (`en-GB`).

## Vormingud

`lib/format.ts` kasutab aktiivse keele `Intl` lokaati (`et-EE`, `en-GB`, `ru-RU`). Eesti keeles kirjutatakse kellaaeg punktiga („17.00"), nagu Figmas ja eesti keele normis (Intl annaks „17:00"). Kilomeetrid ja kaal: `Intl.NumberFormat` + tõlgitud ühik („1,2 km", „1.2 km", „1,2 км").

## Teadlikud erinevused Figmast

Figma tekstid on kasutusel kõigil olemasolevatel ekraanidel. Näidisandmed (nimed, kuupäevad, arvud) tulevad API-st. Allpool on kõik kohad, kus äpp teadlikult erineb.

**Üldreeglid**

| Mis | Figma | Äpp | Põhjus |
|---|---|---|---|
| Nimede käänamine | „Freddy tervis", „Freddy fotoalbum", „Sinu ja Freddy väike maailm", „Freddy on Kadrioru koerapargis." | „{nimi} tervis", „{nimi} fotoalbum" (nimi nimetavas); profiilis „Sinu ja su käpalise / käpaliste väike maailm."; pargi nimi eraldi real | Nimesid ei käänata. „Freddy" ja „Luna" on omastavas samad, kuid „Max" vajaks „Maxi tervis" — need pealkirjad on konsonandiga lõppevate nimede puhul grammatiliselt ebatäpsed (teadaolev piirang). Pargi nimi ja profiili alapealkiri on ümber sõnastatud nii, et käänet pole vaja. |
| „(valikuline)" | puudub | eemaldatud väljadelt, millel on Figma silt (plaani sõnum, kogemus, järgmine tähtaeg, kliinik, märkmed) | Figma järgi; kohustuslik väli annab vea ise. |
| Kellaaeg | „17.00" | „17.00" (eesti), „17:00" (en/ru) | Intl annaks eesti keeles „17:00". |
| Keelevalik | puudub | Seaded → Keel | Mitmekeelsuse nõue. |

**Ekraanid**

| Ekraan (Figma) | Figma | Äpp | Põhjus |
|---|---|---|---|
| Onboarding / Discover | kaardipilt „© OpenStreetMap" | pargi foto (sama, mis pargi lehel) | Staatilist kaardipilti pole; päris kaart vajaks asukohta enne kontot. |
| Onboarding / Connect | ainult „Loo konto" | „Loo konto" + „Mul on juba konto" (Welcome'i tekst); „Jäta vahele" ainult esimesel lehel | Intro on enne Welcome'i, seega olemasolev kasutaja vajab teed sisselogimisse; viimasel lehel pole midagi vahele jätta. |
| Onboarding / Connect | kaart „Freddy ootab sõpru / Kadrioru koerapark · täna 17.00–18.00" | sama näidiskaart koera foto peal, VoiceOveri eest peidetud | Näidisandmed segaksid VoiceOveri kasutajat. |
| Onboarding | — | samm „Samm 1, kokku 2" VoiceOverile („01 / 02" ekraanil) | Numbrid kaldkriipsuga loetakse halvasti ette. |
| Account / Sign Up | „Jätka Apple’iga" | Apple'i natiivne nupp (tekst süsteemi keeles); lisaks „Jätka Google’iga" | App Store'i juhis 4.8 nõuab Apple'i nuppu; Google on lisavõimalus. |
| Account / Reset Password | info „Vaata oma postkasti … Link kehtib piiratud aja." | sama vormil; pärast saatmist eraldi ekraan „Vaata oma postkasti" + „Kui selle aadressiga konto on olemas, saatsime sinna lingi. Link kehtib üks tund." | Ei paljasta, kas konto on olemas; täpne kehtivusaeg on teada. |
| — (pole Figmas) | — | „Uus parool" ekraan | Taastamislingi sihtkoht. |
| Permissions / Location | täisekraan, „Valin piirkonna ise" | kaart kaardiekraanil, „Mitte praegu"; keelatud oleku tekstid „Asukoht on välja lülitatud" | Piirkonna valikut pole veel; kaart ei blokeeri ekraani. |
| Home / Today | „Õue, Freddy?" | koera nimi, kui koer on üks; muidu omaniku eesnimi | Mitme koera korral ei saa ühte valida. |
| Home / Visit / Active | „Freddy on Kadrioru koerapargis.", „Olete nähtavad kuni 18.00" | „Head mängimist!" + pargi nimi + „Freddy · kuni 18.00" / pargi lehel „Oled pargis kuni 18.00" | Pargi nime ei käänata; nähtavus sõltub privaatsusseadest. |
| Home | vahekaart „Lisa" | puudub | Lisamise voog (park, plaan) pole veel üks ekraan. |
| Explore / Map + Park List | eraldi nimekirja ekraan, otsing, „Aktiivsed", „Lemmikud" | nimekiri kaardi all („Pargid sinu ümber", „N paika väikesteks seiklusteks."); otsingut ja neid kiipe pole; lisatud „Kaugused on arvutatud Tallinna kesklinnast." | Üks ekraan; otsing hiljem; asukohata kasutaja peab teadma, millest kaugus arvutatakse. |
| Explore / Filters | „Koerte suurus" | puudub; lisatud „Aiaga piiratud" | Parkidel pole suuruse andmeid; aed on andmemudelis. |
| Park / Overview | vahekaardid Ülevaade / Külastajad / Arvustused | üks keritav leht samade osadega | Lihtsam navigeerimine; sisu sama. |
| Park / Overview | „6 koera, palju häid tutvusi." | sama; 1 → „1 koer, uus tutvus ootab.", 0 → „Praegu on pargis vaikne." | Figma näitab ainult mitmust. |
| Park / Overview | „Pargi teated", „Täna uusi ohuteateid pole", „Vaata, kes praegu mängivad" | puudub | Teadete avalik nimekiri pole veel valmis; külastajad on samal lehel. |
| Park / Overview | „Aiaga piiratud · eraldi väike ala Vesi · pingid · valgustus" | märgid „Aiaga piiratud", „Eraldi väike ala", „Vesi", „Valgustus" | Pinke andmemudelis pole. |
| Park / Overview | — | „Juhata kohale" | Kaardirakenduse juhised. |
| Park / Current Visitors | kiibid Kõik / Väikesed / Rahulikud | puuduvad; rida „Omanik · koerad / tõug · kuni 17.00" | Koera suurust ja meeleolu andmemudelis pole. |
| Park / Reviews | „32 külastuse hinnang · näidisandmed" | „4,8 / 5 · 32 arvustust" ülevaates | Näidisandmed. |
| Visit / Check In | „Mängime / Rahulikult / Tutvume", „Näita meid pargi külastajatele" | puuduvad; lisatud „Kui kauaks?" (30 min – 2 h); „Kohalolek aegub {N} minuti pärast." valitud kestusega | Nähtavus on profiili privaatsusseades; kestus on valitav. |
| Visit / Plan | „Vali või muuda parki", „Freddy / Tuleb mängima", „Teavita minu sõpru" | pargi nimi sildina; koera ja sõprade valikut pole; lisatud „Kestus"; kuupäev kiipidena | Plaan tehakse pargi lehelt; sõbrad M5. |
| Visit / Planned | kinnitusekraan | modaal sulgub, plaan on avalehel ja „Meie jalajäljed" all | Eraldi ekraani pole. |
| Visit / Active | eraldi ekraan „Freddy on Kadrioru koerapargis.", „Lõpeta külastus" | check-in modaal lõpeb vaatega: linnuke, „Head mängimist!", pargi nimi, „Freddy · kuni 18.00", „Vaata mängusõpru" (tagasi pargi lehele, kus on külastajad ja „Lõpeta külastus") | Pargi nime ei käänata; lõpetamine on pargi lehel ja avalehel. |
| Empty State / Meetups | „Veel üks tühi kalender.", „Teeme siia mõne toreda plaani.", tekst, „Loo esimene mänguplaan", „Vaata lähedal olevaid parke" | „Meie jalajäljed" → Planeeritud: pealkiri, tekst ja üks nupp „Vaata lähedal olevaid parke" | Plaan algab pargi lehelt, seega „Loo esimene mänguplaan" viiks samasse kohta; alapealkiri jäi kaardilt välja. |
| Offline State | „Proovi uuesti" | sama nupp igal vea olekul (`ErrorState`), kui puhvris andmeid pole | Üks järjepidev vea olek. |
| Visits / History | kiibid Kõik / Planeeritud / Käidud, „Planeeri uus külastus" | jaotised „Planeeritud" ja „Käidud"; nupp puudub | Plaan vajab parki. |
| Visit / Add Review | „Väga hea / Hea / Kehv", „Lisa foto", „Jaga kogemust teistega", „Salvesta külastus" | 5 tärni, fotot ja jagamise lülitit pole, „Salvesta hinnang"; lisatud „Sinu hinnang aitab teistel õige pargi valida." | API hinne on 1–5; nupp salvestab hinnangu, mitte külastuse. |
| Park / Report Issue | kiibid Klaas / Varustus / Muu, foto, „Näita teadet pargi lehel" | puuduvad; lisatud „Näiteks katkine värav, klaasikillud või mürgikahtlus. Ohu korral helista 112." ja tänu-ekraan „Aitäh!" | Kategooriaid ja fotosid andmemudelis pole. |
| Dogs / My Dogs | „Lisa koer / Veel üks sõber meie kampa" | nupp „Lisa koer"; „Tutvusta oma koera" on tühja nimekirja kaart | Nupul pole alapealkirja. |
| Dog / Profile | iseloomu kiibid, „Väike koer, suur uudishimu." | iseloom tekstikaardis „ISELOOM"; faktides ka kaal; „Fotod: Meie väikesed seiklused · N fotot" | Iseloom on vabatekst. |
| Dog / Edit Profile | „Kaal" | „Kaal (kg)", kuupäeva vihje „AAAA-KK-PP", tõu vihje „Näiteks cardigan corgi" | Tekstiväli vajab ühikut ja vormingut. |
| Dog / Health | „Siia saad talletada loomaarsti antud info ja dokumendid.", „dokument lisatud" | „Tervisekirjed on nähtavad ainult sulle." | Dokumente veel ei toetata. |
| Health / Add Vaccination, Vet Visit | „Dokument", „Failid", „Tuleta tähtaega meelde", kuupäeva vihje „Loomaarsti märgitud kuupäev" | puuduvad; „Meeldetuletus ilmub avalehele 30 päeva enne tähtaega."; vihje „AAAA-KK-PP"; liigi kiibid „Vaktsineerimine / Arstivisiit" | Failid hiljem; meeldetuletus on alati sees; tekstiväli vajab vormingut; üks vorm mõlemale liigile. |
| Dog / Photos | „Lisa foto" | „Pildista" / „Vali galeriist" | Kaks allikat. |
| Saved / Favorite Parks | „6 koera praegu · järgmine plaan täna" | pargirida „6 koera praegu" | Plaanid on avalehel. |
| Offline State | täisekraan „Võtame korraks hoo maha.", „Proovi uuesti", „Minu lemmikpargid" | bänner „Internetiühendus puudub." + „Näitame viimati laaditud andmeid ja uuendame, kui ühendus taastub." | Bänner on igal ekraanil, puhverdatud andmed jäävad näha. |
| Profile / Overview | „1 koer · 18 külastust · 5 sõpra", „Sõbrad ja sõnumid", „Minu broneeringud" | „1 koer · 18 külastust"; read „Oma kamp" ja „Sõnumid" (uute kutsete / lugemata arvuga); „Minu broneeringud" alapealkirjaga „Hooldus ja kohtumised" või „N tulevat kohtumist" | Sõprade arv ja sõnumid on eraldi ridadel. |
| Settings / Overview | „Asukoht", „Abi ja tugi", „Lisa koerapark" | „Muuda profiili", „Teavitused", „Privaatsus", „Keel", „Logi välja" | Ülejäänud tulevad koos funktsioonidega. |
| Settings / Overview | „Teavitused / Sõbrad, pargid ja meeldetuletused" | „Teavitused / Sõbrad, sõnumid ja plaanid" | Pargi- ja meeldetuletuse push'e pole; alapealkiri kirjeldab olemasolevaid. |
| Profile / Edit | „E-post", „Huvid", vihje „Freddy inimene. Alati valmis jalutama." | puuduvad; vihje „Paar sõna sinust ja su koerast"; lisatud „Kes näeb, kui oled pargis?" | E-post muutub Better Authi vooga; Figma vihje on näidisandmed. |
| Notifications / Activity | kiibid Kõik / Sõbrad / Pargid, „Sinu lemmikpargis on teade" | kiibid Kõik / Sõbrad / Sõnumid; pargiteateid pole; enne süsteemi dialoogi selgitus „Kas anname märku?" | Pargiteadete teavitusi pole veel; push vajab selgitust enne iOS-i ühekordset küsimust. |
| Community / Friends | „Mari ja Luna / Täna Kadriorus kell 17.00", „Planeeri ühine külastus" | sõbra rida „{nimi} ja {koerad}" + piirkond; plaanid avalehel; ühine külastus profiilil „Kutsu parki" | Plaan on avalehe kaardil; kutse vajab sõpra. |
| Community / Friend Profile | iseloomu kiibid „Sõbralik / Rahulik", „Luna profiil", „sõbrad alates septembrist" | koera kaart „Koer {nimi}" (tõug · vanus · iseloom), „Sõbrad alates 02.10.2026" (vene ja inglise keeles pikk kuupäev, kus Intl käänab kuu) | Nimesid ei käänata; iseloom on vabatekst; Intl ei oska „septembrist". |
| Messages / Conversation | „Tavaliselt vastab päeva jooksul.", „Ühine mänguplaan" kaart | puuduvad; pargikutse on tavaline sõnum | Vastamisaja andmeid pole; plaan + sõnum katab sama vajaduse. |
| Settings / Notifications | „Lemmikpargi ohuteated", „Külastuse meeldetuletused", „Broneeringute uuendused", „Tervise meeldetuletused" | „Sõnumid sõpradelt", „Sõbrad lähevad parki", lisatud „Sõbrakutsed", „Broneeringute uuendused" (M6, broneeringu meeldetuletus) | Ülejäänud push-tüüpe veel pole. |
| Settings / Privacy | „Profiil nähtav pargisõpradele" lüliti, „Kogukonna turvalisus / Abi ja teavitamine" | puuduvad; tutvustus ja koerte detailid on alati ainult sõpradele | Reegel on fikseeritud; abi-vaade hiljem. |
| Home / Today | „Luna ja 3 sõpra plaanivad Kadriorgu minna kell 17.00." | kaart „Sõbrad lähevad parki" ridadega „{park} / {nimi} · täna 17.00–18.00" + „Leia mängusõbrad" | Pargi nime ei käänata. |
| Home / Today | — | rida „Teenused / Hooldus, treening ja kliinik" | Figmas jõuab teenusteni ainult Profiil → Minu broneeringud → „Leia uus teenus". |
| Services / Discover | „Teenused sinu käpalisele · kontseptsioon", kiibid Hooldus / Treening / Kliinik, „Kadriorg · alates 35 € · näidisteenus", „Tuleviku vaade", „Teenusepakkujad, hinnad ja ajad on disaini näidisandmed." | „Teenused sinu käpalisele"; kiip „Kõik" ees; rida „Käpakoda · koerte hooldus" + tutvustus + „Kadriorg · 1,2 km · alates 35 € · ★ 4,9"; „Teenusepakkujad, hinnad ja ajad on näidisandmed." | Andmed tulevad API-st, pakkujad on väljamõeldud; valikust loobumine peab olema nähtav. |
| Service / Groomer | teenuste read, „Vali sobiv aeg" | teenused raadionuppudena (odavaim valitud), aadress ja hinnang | Valik peab olema selge ja VoiceOveriga loetav. |
| Booking / Select Time | „Aeg iseendale. Ja puhtale karvale.", „Käpakoda · näidisbroneering", „Hind alates 35 €" | pealkiri kategooria järgi (treening „Aeg koos õppida.", kliinik „Aeg tervisele."); alapealkiri pakkuja nimi; lisatud „Kellaaeg", „Kes tuleb?", tühistamisreegel | Figma pealkiri sobib ainult hooldusele; broneering on koera kohta. |
| Booking / Confirmed | „Freddy hooldusaeg" | kaart „Freddy · Pesu ja kammimine" + aeg, pakkuja, hind | Nime ei käänata. |
| Bookings / My Bookings | „Sinu koera järgmised kohtumised." | sama, mitme koera korral „Sinu koerte …"; tühjad olekud; „Tühista broneering" kinnitusega | Mitmus; HIG: hävitav tegevus vajab kinnitust. |

**Parandatud grammatika (tekst, mida Figmas pole)**

| Enne | Pärast |
|---|---|
| „1 fotot" | „1 foto" / „12 fotot" (mitmuse võtmed) |
| „4 a", „7 kuud" | „4 aastat", „1 aasta", „7 kuud", „1 kuu", „alla kuu" |
| „1 hinnang / 32 hinnangut" | „1 arvustus / 32 arvustust" (Figma sõna) |
| „+ 3 koera, kelle omanik ei jaga…" | „+ 1 koer, kelle omanik…" / „+ 3 koera, kelle omanikud…" |
| „Kustutada Freddy?" | „Kustutada koer Freddy?" (nimi nimetavas) |
| „Luba Käpp-il kaamerat kasutada…" | „Luba seadetes kaamera kasutamine, et koerast pilti teha." |
| „Näitan…/Uuendan…" (mina-vorm) | „Näitame…/uuendame…" (Figma meie-hääl) |
| „Kohalolek aegub" (kestus puudus) | „Kohalolek aegub 60 minuti pärast." (omastav, sobib iga arvuga) |
| „Sündinud 1. märts 2026" (vajaks „märtsil") | „Sünnikuupäev: 1. märts 2026" (sildivorm) |
| „Foto, lisatud 1. märts 2026" | „Foto, lisamise kuupäev 1. märts 2026" |
| „Иду в парк X пятница, 2 окт. в 17:00" (nimetav pärast eessõnata tegusõna) | „Иду в парк X: пятница, 2 окт., 17:00"; eesti „Lähen parki X: reede, 2. okt kell 17.00" |

**Reegel:** kuu- või nädalapäeva nime (Intl annab nimetava) ei panda eesti ega vene keeles eessõna või käänet nõudva sõna järele („kuni laupäev", „до суббота", „с октябрь"). Kasuta sildivormi („Tühistamise tähtaeg: …", „Sünnikuupäev: …") või numbrilist kuupäeva.

## Mida pole kontrollitud

- iOS-i simulaatoris ega seadmes pole tõlkeid, keelevalikut ega `InfoPlist.strings`-i vaadatud (arenduskeskkonnas simulaatorit polnud); kontrollitud on `tsc`, lint, testid, `expo-doctor` ja `expo config` väljund.
- Hermes'e `Intl` vene ja eesti vormingud (kuupäevad, `toLocaleUpperCase`) on eeldatud, mitte seadmes nähtud.
- Inglise ja vene tekstid vajavad emakeelse kõneleja ülevaatust.
