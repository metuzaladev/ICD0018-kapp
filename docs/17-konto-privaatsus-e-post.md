# 17. Konto kustutamine, privaatsuspoliitika ja e-post (M10)

Poodi minekuks puudu olnud kolm asja (docs/15): kasutaja saab konto äpis ise kustutada (Apple App Store Review Guideline 5.1.1(v), Google Play, IKÜM art 17), privaatsuspoliitika ja kasutustingimused on avalikul URL-il ja äpis, ning parooli taastamise, e-posti kinnituse ja kustutamise kinnituse kirjad lähevad päriselt teele.

| Mis | Kus | Seis |
|---|---|---|
| `DELETE /api/v1/me` (taas-autentimine, üks transaktsioon, failid pärast commit'i) | `apps/api/src/modules/account/` | ✅ unit, HTTP, integratsioon |
| Andmete eksport `GET /api/v1/me/export` (JSON) | `account.repository.ts` → `exportData` | ✅ |
| Privaatsuspoliitika ja tingimused et/en/ru (Markdown) | `packages/shared/src/legal/*.md` | ✅ — **vastutav töötleja täitmata** |
| Avalikud lehed `GET /legal/privacy`, `/legal/terms`, `/email-verified` | `apps/api/src/modules/legal/` | ✅ HTTP-testid, Docker image'is kontrollitud |
| Nõusoleku versioonid (`user.terms_version`, `privacy_version`, `legal_accepted_at`) | migratsioon `0008_m10_account` | ✅ |
| E-post: `log` / `smtp` (nodemailer) / `resend`, BullMQ järjekord | `apps/api/src/modules/mail/` | ✅ unit (MockAgent, stream transport), integratsioon (päris Redis) |
| E-posti kinnitus (ei blokeeri sisselogimist) + uuesti saatmine | Better Auth `emailVerification`, `POST /me/email-verification` | ✅ |
| Äpp: Seaded → Konto, Kustuta konto, Privaatsus ja tingimused, nõusoleku leht, „Kinnita e-post" | `apps/mobile/src/app/{delete-account,privacy-terms,legal/[doc]}.tsx` | ✅ tsc, lint, i18n, a11y, `expo export`; **simulaatoris nägemata** |

## 17.1 Konto kustutamine

```mermaid
sequenceDiagram
  participant App
  participant API as DELETE /api/v1/me
  participant DB as Postgres (üks transaktsioon)
  participant Q as BullMQ (Redis)
  App->>API: { password } või {} (Apple/Google, värske sessioon)
  API->>API: taas-autentimine (parool / sessioon < 10 min)
  API->>DB: lukusta user → kogu failivõtmed → tühista tulevased broneeringud →<br/>kustuta esitatud teated ja verification-read → DELETE user (kaskaad) → tühjad vestlused
  DB-->>API: commit
  API->>Q: storage-cleanup (võtmed + eesliited), meeldetuletuste eemaldus, kinnituskiri
  API-->>App: 204
  App->>App: signOut (SecureStore tühjaks) → Welcome + „Sinu konto on kustutatud"
```

| Otsus | Põhjus |
|---|---|
| **Oma endpoint `DELETE /me`, mitte Better Authi `deleteUser`** (`/delete-user` on `disabledPaths`-is) | Better Authi voog kustutab sessioonid, kontod ja kasutaja eraldi päringutena; meie koristus (failivõtmete kogumine, broneeringud, teated, vestlused) peab olema **samas transaktsioonis**. Oma endpoint annab ka meie veavõtmed (et/en/ru), kiiruspiirangu ja järjekorra pärast commit'i. Sessioonid kaovad kaskaadiga samas lauses. |
| **Taas-autentimine**: e-posti kontol kehtiv parool; ainult Apple/Google kontol sessioon, mis on loodud viimase **10 minuti** jooksul (`REAUTH_WINDOW_MINUTES`), muidu `403 errors.reauthRequired` („logi uuesti sisse") | Lukustamata telefon või lekkinud küpsis ei tohi piisata pöördumatuks tegevuseks. 10 min jõuab sisse logida ja vajutada, aga tundide eest avatud sessioon enam ei sobi. Parool kontrollitakse Better Authi enda räsijaga (`ctx.password.verify`). Vale parool on `403`, mitte `401` (äpp ei tohi kasutajat välja visata). |
| Kiiruspiirang **5 katset / 15 min** | Kehas on parool — kustutamine ei tohi muutuda parooli arvamise oraakliks. |
| **Sõnumid: anonüümimine, mitte kustutamine** — `messages.sender_id` muutub `null`-iks (`on delete set null`), vestluskaaslane näeb „Kustutatud kasutaja", nime ega profiili pole; vestlus kustub täielikult, kui ka teine osaline konto kustutab | Sõnum on ka saaja kirjavahetus (nagu e-kiri, mis jääb saaja postkasti); kustutamine muudaks teise inimese vestluse arusaamatuks. Kustutatud isikuga seost ei jää (pole ID-d, nime ega profiili). Sisu võib siiski isikuandmeid sisaldada — see on privaatsuspoliitikas (p 7) ja kustutamise vaates ausalt kirjas, nii et kasutaja teab enne. Teine osaline saab vestluse eemaldada oma konto kustutamisega; eraldi „kustuta vestlus" on hilisem samm. |
| **Esitatud teated kustutatakse** (kasutaja, pargi ja postituse teated), kuigi võõrvõti seaks vaid `null`-i | Teate tekst on kustutaja kirjutatud (sageli teise inimese kohta); anonüümne säilitamine ilma modereerimise tööriistata ei kaalu üles õigust olla unustatud. **Kustutaja kohta esitatud teated** kaovad kaskaadiga — teadlik kompromiss, kuni admin-vaadet pole. |
| Kasutaja lisatud **pargid jäävad** (`created_by → null`) | Park on avalik kaardiandmestik, isikuandmeid seal pole. |
| **Tulevased broneeringud tühistatakse** samas transaktsioonis ja read kaovad kasutajaga; pakkuja aeg vabaneb (`bookings_no_overlap` arvestab ainult olemasolevaid ridu). Pärast commit'i eemaldatakse nende BullMQ meeldetuletused. | Pakkujakontosid pole (docs/13), seega pakkujat eraldi ei teavitata. |
| **Käpad**: kanderaamat kaob kaskaadiga — M9b päästik lubab `DELETE`-i ainult kaskaadi seest (`pg_trigger_depth() > 1`) | Kontrollitud integratsioonitestis. |
| Better Authi **`verification`** read kustutatakse käsitsi (`value = userId` või `identifier = email`) | Neil pole võõrvõtit. |
| **Failid pärast commit'i** BullMQ tööna `storage-cleanup` (10 katset, eksponentsiaalne ooteaeg ~8,5 h, ebaõnnestunud jäävad 7 päevaks Redisesse) | Read enne, objektid pärast (docs/06): hoidla tõrge ei saa andmeid tagasi tuua. Töö on idempotentne (puuduva võtme kustutamine pole viga). Lisaks täpsetele võtmetele kustutatakse eesliited `dogs/<dogId>/`, `places/<postId>/`, `uploads/<userId>/` — ka objektid, mille rida jäi kirjutamata. Logis ainult ID-d ja arvud. |
| **Auditirida** `account_deleted` (`userId`, meetod, objektide ja broneeringute arv) | Ilma nime ja e-postita (docs/15). |
| Kinnituskiri kasutaja keeles | Aadress loetakse enne kustutamist; kiri läheb järjekorda (17.3). |
| **Apple'i tokeni tühistamine** (Sign in with Apple REST `/auth/revoke`) | **TODO:** vajab Apple'i võtmeid (docs/07). Seni kustub meie poolt kõik; kasutaja saab Apple ID seadetes Käpa „Sign in with Apple" lingi eemaldada. Kui võtmed lisatakse, tuleb kustutamise järel kutsuda Apple'i revoke-endpointi `account.refresh_token`-iga (enne rea kustutamist kätte saada). |

**Äpp:** Seaded → „Konto" → punane „Kustuta konto" (viimane rida) → vaade loetleb täpselt, mis kustub, sõnumite anonüümimise ja varukoopiate 30 päeva, pakub enne andmete allalaadimist → parool või „Logi uuesti sisse" (Apple/Google nupp) → süsteemi hävitav kinnitusdialoog (Loobu / Kustuta). Sõna trükkimist ei nõuta: HIG soovitab hävitava tegevuse jaoks kinnitusdialoogi, kus loobumine on üks puudutus; trükitud sõna on ligipääsetavuse (VoiceOver, vene/eesti klaviatuur) jaoks tülikas. Õnnestumisel `signOut()` (SecureStore tühjaks), juur vahetab Welcome'ile, kus on suletav teade (loetakse VoiceOveriga ette). `401`/`404` kustutamisel tähendab „juba kustutatud" (nt esimese katse vastus läks kaduma) ja logib samuti välja.

## 17.2 Privaatsuspoliitika ja kasutustingimused

- **Allikas:** `packages/shared/src/legal/{privacy,terms}.{et,en,ru}.md`, eesti keel on originaal. `npm run legal:build` kirjutab need `content.generated.ts`-i, mida impordivad nii API bundle (esbuild) kui äpp (Metro) — failisüsteemi ega Markdowni laadijat pole vaja. `scripts/legal-build.test.ts` kukub, kui genereeritud fail on vananenud või mõnes keeles on teine arv peatükke.
- **Versioonid:** `LEGAL_VERSIONS` (`packages/shared/src/legal/index.ts`), praegu `2026-10-05`. **Sisu muutmisel tõsta versiooni** — äpp küsib kõigilt uuesti nõustumist. Kirjavea parandus versiooni ei muuda.
- **Renderdamine:** üks pisike Markdowni alamhulk (pealkirjad, lõigud, loendid, **paks**, lingid ainult `https://` ja `mailto:`), parsitakse jagatud koodis plokkideks. API teeb neist HTML-i (kõik varjestatud, välised ressursid puuduvad, hele/tume, `lang`), äpp natiivsed `Text`-id (pealkirjad on VoiceOveri `header`).
- **URL-id poe jaoks:** `https://api.<domeen>/legal/privacy` ja `/legal/terms` (`?lang=en|ru`, muidu `Accept-Language`, vaikimisi eesti). Need on App Store Connecti „Privacy Policy URL" ja Play Console'i privaatsuspoliitika väli.
- **Äpis:** Sign Up vormi all ja Welcome'i jaluses nupud „Kasutustingimused · Privaatsuspoliitika", Seaded → „Privaatsus ja tingimused" (ka andmete eksport). Ekraan `legal/[doc]` on kummastki kaitstud grupist väljas, seega loetav ka sisse logimata.
- **Nõusolek:** registreerimine saadab `termsVersion`, `privacyVersion` (ja `language`) Better Authi `additionalFields`-ina; `databaseHooks.user.create.before` salvestab need koos ajaga ainult siis, kui need on kehtivad versioonid (vana build saab `400 errors.legalVersionOutdated`). Apple/Google registreerimisel neid pole → `null` → äpp näitab kohe blokeerivat lehte („Enne alustamist": loe tingimusi, „Nõustun" või „Logi välja"). Sama leht („Tingimused on uuenenud") tuleb versiooni muutumisel. `PUT /me/legal-acceptance` võtab vastu ainult kehtivad versioonid (`409` muidu). Leht on `Modal` (fullScreen, ei saa ära libistada) ja dokumendid avanevad selle sees, sest navigeerimine jääks modaali taha.
- **Vanusepiir 13** (IKS § 8 lg 1: infoühiskonna teenuse puhul kehtib lapse nõusolek alates 13. eluaastast; teenus on suunatud Eestile). Nõusolekul põhineb vaid asukoha ja push'i kasutus, ülejäänu lepingul; sõnumeid saab saata ainult vastastikustele sõpradele (docs/12), avalikku vestlust pole. Kontrolli registreerimisel pole (tekst nupu kohal ja tingimustes) — App Store'i vanusehinnang peab sellega klappima (12+ kasutajasisu tõttu).
- **Säilitusajad** on kirjutatud selle järgi, mida kood tegelikult teeb: kõik kuni konto kustutamiseni (kohalolekute ajalugu, teated — automaatset lühemat tähtaega pole, vt docs/03 lahtine küsimus), sessioon 30 päeva, reset-link 1 h, kinnituslink 24 h, e-kirja järjekorrast eemaldatakse aadress kohe pärast saatmist, toorfailid 1 päev, logid ≤ 30 päeva, varukoopiad 30 päeva (docs/15).

### IKÜM kaardistus

| Artikkel | Kuidas täidetud |
|---|---|
| 5 lg 1 p c (minimeerimine) | Seadme asukohta ei salvestata; fotodelt EXIF/GPS maha; logides pole IP-d, päringuparameetreid ega e-posti. |
| 5 lg 1 p e (säilitamise piiramine) | 17.2 säilitusajad; e-kirja töö redigeeritakse pärast saatmist. |
| 6 (alused) | Leping (konto, sisu, broneeringud, teenuskirjad), nõusolek (asukoht, push — seadme load), õigustatud huvi (turvalisus, modereerimine, logid, varukoopiad). Turunduskirju pole. |
| 7 (nõusoleku tõendamine) | `terms_version`, `privacy_version`, `legal_accepted_at`. |
| 8 (laps) | Vanusepiir 13, tingimustes ja registreerimise tekstis. |
| 12–14 (teavitamine) | Privaatsuspoliitika et/en/ru, äpis ja avalikul URL-il. |
| 15, 20 (juurdepääs, ülekandmine) | `GET /me/export` (JSON), äpis „Laadi minu andmed alla" (süsteemi jagamisleht). |
| 16 (parandamine) | Profiil, koerad jne on äpis muudetavad. |
| 17 (kustutamine) | `DELETE /me`, failid hoidlast pärast commit'i, varukoopiatest 30 päevaga. |
| 21 (vastuväide), 18 (piiramine) | E-posti teel vastutavale töötlejale (privaatsuspoliitika p 8). |
| 28 (volitatud töötlejad) | Loetelu privaatsuspoliitika p 5-s; DPA sõlmimine on käsitsi samm (17.5). |
| 32 (turvalisus) | HTTPS, scrypt, SecureStore, privaatne hoidla lühikeste linkidega, taas-autentimine kustutamisel. |
| 44–46 (edastamine) | DPF / SCC, privaatsuspoliitika p 6 (kontrollida iga pakkuja kehtiv alus). |

## 17.3 E-post

| Otsus | Põhjus |
|---|---|
| **Liides `Mailer` → BullMQ järjekord `mail` → töötaja → transport** (sama muster nagu push, docs/12) | E-posti teenus on aeglane väline teenus; päring ei tohi selle taga rippuda ega selle tõrkel ebaõnnestuda. `Mailer` ei viska kunagi viga: parooli taastamise päringu viga paljastaks, et aadressil on konto. |
| **Transport `MAIL_PROVIDER`-i järgi:** `log` (arenduse vaikimisi; logib teema ja arenduses lingi, **mitte kunagi aadressi**; toodangus keelatud), `smtp` (nodemailer, puhas JS — natiivset moodulit pole), `resend` (HTTP) | SMTP sobib iga EL-i pakkujaga (Brevo, Mailjet, Scaleway TEM); üks HTTP-pakkuja annab idempotentsuse ja selgema veaklassi. |
| **HTTP-pakkuja: Resend, mitte Postmark** | Resendil on natiivne `Idempotency-Key` päis (24 h) — korduv töö ei saada sama kirja kaks korda — ja domeeni saab luua **EL-i saatepiirkonnas** (`eu-west-1`). Postmark on samuti hea kättetoimetamisega, aga USA-s hostitud ilma EL-i andmeresidentsuseta. Mõlemad on USA ettevõtted: vaja on DPA-d ja DPF/SCC katet (privaatsuspoliitika p 6). EL-i ettevõtte eelistamisel kasuta `smtp` + EL-i pakkujat — koodi muuta pole vaja. |
| **Kordused ja veaklassid:** 6 katset (~30 min, eksponentsiaalne). Püsivad vead (`UnrecoverableError`, ei korrata): SMTP 5xx, `EAUTH`, `EENVELOPE`; Resend 4xx (v.a 409, 429). Ajutised: võrk, ajalõpp, SMTP 4xx, Resend 429/409/5xx. | Vale aadress või võti ei parane kordamisega; hall-nimekiri ja limiit paranevad. |
| **Idempotentsus** (template, kasutaja, token): töö ID = `mail-<template>-<sha256>`; sama ID-d ei lisata teist korda (töö hoitakse 24 h); sama ID läheb Resendile `Idempotency-Key`-na | Korduv päring või töötaja taaskäivitus ei saada topelt; räsi hoiab kasutaja ID ja tokeni Redise võtmetest väljas. |
| **Isikuandmed Redises:** töö sisaldab aadressi ja lingi (mandaat). Pärast saatmist või lõplikku ebaõnnestumist asendatakse töö andmed `{ template, redacted: true }`-ga; veateade koosneb ainult koodist/staatusest (mitte pakkuja vastusest, mis võib aadressi sisaldada). | Docs/15: logides ja salvestis ei tohi aadresse olla. |
| **Mallid:** tavatekst + lihtne ligipääsetav HTML (üks veerg, `lang`, pealkiri, nupp-link + sama URL tekstina, süsteemifondid, **väliseid pilte ega jälgimispikslit pole**), tekstid `email.*` võtmetena `packages/shared/src/i18n` (i18n:check kontrollib), keel `user.language`. | Bränd = roheline „käpp" sõnamärk tekstina. |
| **E-posti kinnitus: saadetakse registreerimisel, sisselogimist ei blokeerita** (`requireEmailVerification: false`); Home'is „Kinnita e-post" bänner kuni kinnitamiseni, „Saada uuesti" | Lukustatud konto aeglase või rämpsposti läinud kirja tõttu maksaks rohkem kui kinnitamata aadress: Käpp saadab sinna ainult oma teenuskirju. Kinnitamata aadress ei ava midagi lisaks. |
| Uuesti saatmine ainult **`POST /api/v1/me/email-verification`** (sisse logitud, 3 tunnis); Better Authi avalik `/send-verification-email` on keelatud | Avalik endpoint laseks igaühel suvalisele aadressile kirju saata. |
| Kinnituslink → `…/auth/verify-email?token=…&callbackURL=<API>/email-verified?lang=..` → avalik leht „E-post on kinnitatud" (või vigase/aegunud lingi korral juhend) | Töötab ka arvutis avatuna; äpp näeb muutust järgmisel profiili värskendusel (fookus). |
| „Uus sisselogimine uuest seadmest" kiri | **Jäetud tegemata** (pole triviaalne: seadme tuvastus + teavitusväsimus). |

**Parooli taastamine lõpuni:** äpp kutsub `requestPasswordReset({ redirectTo: Linking.createURL('/new-password') })` → kirjas on `https://api.<domeen>/api/v1/auth/reset-password/<token>?callbackURL=kapp%3A%2F%2Fnew-password` → API kontrollib tokenit ja suunab `kapp://new-password?token=…` → äpi ekraan `new-password` (grupis `(auth)`, seega ainult välja logituna). Link töötab samas telefonis, kus äpp on paigaldatud. **Universal links / App Links** (link avab äpi otse ka ilma brauserita ja arvutis avamisel juhendaks) vajavad domeeni `apple-app-site-association` / `assetlinks.json` faile ja `associatedDomains` seadistust — hilisem samm pärast domeeni olemasolu.

## 17.4 Keskkonnamuutujad

| Muutuja | Toodangus | Vaikimisi | Tähendus |
|---|---|---|---|
| `MAIL_PROVIDER` | **`smtp` või `resend`** (`log` keelatud) | `log` | 17.3 |
| `MAIL_FROM` | **kohustuslik** | `Käpp <noreply@localhost>` | Saatja; domeenil peavad olema SPF ja DKIM |
| `SMTP_URL` | kui `smtp` | – | `smtps://kasutaja:parool@host:465` (saladus) |
| `RESEND_API_KEY` | kui `resend` | – | ainult saatmisõigusega võti (saladus) |
| `PUSH_WORKER_ENABLED` | | `true` | Nüüd kõik BullMQ töötajad: push, meeldetuletused, e-post, failide koristus |

Valitud pakkuja ilma võtmeta on viga igas keskkonnas (käivitus katkeb kohe). CI `docker` töö käivitab image'i võltsitud Resendi võtmega (kirju ei saadeta).

## 17.5 Mida pead ise tegema

1. **Vastutav töötleja:** asenda `[Vastutav töötleja: nimi, registrikood, e-post]` kõigis kuues failis `packages/shared/src/legal/*.md` (nimi, registrikood või isikukood, kontakt-e-post) → `npm run legal:build`. Kuni see on asendamata, logib API käivitumisel hoiatuse.
2. Täpsusta privaatsuspoliitikas nurksulgudes kohad: majutuse pakkuja (p 5), e-posti teenus (p 5), edastamise alus iga pakkuja kohta (p 6). Lase tekst üle vaadata (soovitavalt jurist või TalTechi andmekaitse kontakt); tõlked vajavad emakeelse kõneleja ülevaatust.
3. **E-posti pakkuja:** Resendis loo domeen **EL-i piirkonnas**, saatmisõigusega API võti → `RESEND_API_KEY`; või SMTP-pakkuja → `SMTP_URL`. `MAIL_FROM=Käpp <noreply@<domeen>>`. Sõlmi pakkujaga DPA.
4. **DNS:** pakkuja antud **SPF** (`TXT v=spf1 include:… ~all`) ja **DKIM** kirjed, soovitavalt **DMARC** (`_dmarc TXT v=DMARC1; p=quarantine; rua=mailto:…`) ja Resendi puhul tagastusteede (bounce) MX/TXT kirje. Ilma nendeta lähevad kirjad rämpsposti või lükatakse tagasi.
5. **Poed:** App Store Connect → App Privacy → Privacy Policy URL = `https://api.<domeen>/legal/privacy`; App Review märkmetesse, kus on konto kustutamine (Seaded → Konto → Kustuta konto). Play Console → Data safety → konto kustutamise **veebilink** on kohustuslik: kasuta `https://api.<domeen>/legal/privacy` (p 8 kirjeldab kustutamist äpis ja e-posti teel) või tee eraldi leht.
6. Apple'i tokeni tühistamine (17.1 TODO), kui Sign in with Apple võtmed tulevad.
7. Andmebaasi migratsioon `0008_m10_account` (jagatud arendusbaasis `npm run db:migrate`, toodangus `node dist/migrate.js`).

## 17.6 Testid

- **Unit** (`test/unit/m10-account.test.ts`, `m10-mail.test.ts`, `env.test.ts`): taas-autentimise reeglid (parool puudu/vale, vana sessioon parooliga OK, sotsiaalkonto aken ± 1 s, parool ei asenda akent), 404 ja võidujooks, commit'i-järgne järjekord (võtmed, meeldetuletused, kiri, auditirida ilma isikuandmeteta), järjekorra tõrge ja rippumine ei nurjata kustutamist, andmebaasi ja paroolikontrolli ajalõpp; nõusolek, eksport, kinnituse uuesti saatmine; failide koristus (idempotentne, viga → kordus); mallid kolmes keeles (teema, `lang`, link kaks korda, välised ressursid puuduvad, varjestus); Resend MockAgentiga (päised, idempotentsusvõti, iga staatuse klass, võrguviga, aadress veas puudub); SMTP stream transpordiga ja veaklassid; töötleja (redigeerimine, püsiv viga → `UnrecoverableError`, ajutine viga jätab andmed korduseks, redigeeritud tööd ei saadeta); töö ID; järjekorda panija ei viska ja ei logi aadressi; toodangu konfiguratsiooni reeglid.
- **HTTP** (`test/http/m10.routes.test.ts`): `DELETE /me` 204 / 400 (puuduv, `null`, vale tüüp, tühi, tundmatu väli) / 401 enne valideerimist / 403 tõlgituna kolmes keeles / 404 / 503 / 429; nõusolek, eksport (manusena, `no-store`), uuesti saatmine (409, 429); avalikud lehed (HTML, keelevalik, välised ressursid puuduvad, 400/404, sessiooni pole vaja).
- **Integratsioon** (`test/integration/account.flow.test.ts`, `mail.flow.test.ts`; päris Postgres/PostGIS, MinIO, Redis): kasutaja andmed igas tabelis → kustutamine → **üldine kontroll üle kõigi `"user"`-ile viitavate võõrvõtmete** (`information_schema`) ei leia ühtki rida; teise kasutaja vestlus jääb loetavaks (`other: null`, saatja `null`, saata ei saa); koristustöö võtmed ja eesliited, MinIO tühjaks ka ridadeta objektidest, kaks korda ohutu; vana sessioon → 401; sotsiaalkonto aken; nõusolek registreerimisel ja vananenud versioon; avalik saatmisendpoint 404, uuesti saatmise limiit, kinnituslink → leht; reset ja kinnitus päris BullMQ järjekorda (üks töö kumbki, tundmatule aadressile mitte ühtegi), töötaja saadab inglise keeles ja redigeerib tööd.
- **Äpp** (`apps/mobile/test/account.test.ts`): taas-autentimise viis, päringu keha, nupu lubamine, „juba kustutatud" staatused, nõusoleku vajadus ja tüüp, teade Welcome'ile. **Skriptid** (`scripts/legal-build.test.ts`): genereeritud fail ajakohane, versioon igas tekstis, peatükkide arv, Markdowni parser (ohtlikud lingid jäävad tekstiks).

## 17.7 Mida pole kontrollitud

- Äpi vaateid (kustutamine, nõusoleku leht, õiguslikud tekstid, bänner, Welcome'i teade, kustutatud kasutaja vestluses) pole simulaatoris ega seadmes nähtud: kontrollitud `tsc`, lint, `i18n:check`, `a11y:check`, unit-testid ja `expo export` (iOS bundle).
- Apple/Google taas-sisselogimine kustutamise vaates on testimata (võtmeid pole); Google'i brauserivoo katkestamisel võib „Sisse logitud" teade ilmuda ekslikult — server kontrollib akent igal juhul.
- Päris e-posti pole saadetud (kontosid ega võtmeid pole): Resend on testitud MockAgentiga, SMTP nodemaileri stream-transpordiga. Kättetoimetatavus (SPF/DKIM/DMARC) on kontrollimata.
- Parooli taastamise link päris kirjast telefonis (kapp:// suunamine) on kontrollitud ainult API poolelt.
- Jagamislehe (`Share.share`) käitumine väga suure ekspordi korral; Android võib pikka teksti kärpida.
- Õiguslikud tekstid ei ole juristi üle vaadatud; en/ru tõlked vajavad emakeelse kõneleja ülevaatust.
