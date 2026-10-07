# Käpa privaatsuspoliitika

**Versioon 2026-10-05.** Selles dokumendis kirjeldame, milliseid isikuandmeid Käpa äpp ja server töötlevad, miks, kui kaua ja kellega neid jagatakse ning kuidas saad oma õigusi kasutada.

## 1. Vastutav töötleja

[Vastutav töötleja: nimi, registrikood, e-post]

Käpp on TalTechi aine ICD0018 raames valminud tudengiprojekt. Kõigis privaatsusküsimustes kirjuta ülaltoodud e-posti aadressil.

## 2. Milliseid andmeid töötleme

- **Konto:** nimi, e-posti aadress, parooli räsi (parooli ennast me ei näe ega salvesta), Apple'i või Google'i konto tunnus, kui logid nendega sisse, äpi keel, e-posti kinnituse olek ning see, millise tingimuste ja privaatsuspoliitika versiooniga ja millal nõustusid.
- **Profiil ja seaded:** piirkond, tutvustus, kohaloleku jagamise seade, sõbrakutsete seade, teavituste eelistused.
- **Koerad:** nimi, tõug, sugu, sünnipäev, kaal, iseloom ja fotod. **Tervisekirjed** (vaktsineerimised, arstivisiidid, kliinik, märkmed) näed ainult sina.
- **Kohalolek ja plaanid:** millises pargis ja mis ajal märkisid end kohale või plaanid minna. Seadme täpset asukohta me ei salvesta: lähimate parkide leidmiseks saadab äpp koordinaadid päringuga, server kasutab neid ainult vastuse arvutamiseks ega kirjuta neid logisse.
- **Kogukond:** sõbrad ja sõbrakutsed, sõnumid, blokeeringud, teavituste voog ning teated (need, mille esitasid sina, ja need, mis esitati sinu kohta).
- **Sinu lisatud sisu:** pargihinnangud, ohuteated pargis, kohtade soovitused koos fotodega, meeldimised ja salvestused.
- **Teenused ja Käpad:** broneeringud (teenus, aeg, koerad, märkus), Käppade punktide ajalugu ja saldo, sooduskoodid ja sõbrakutsed.
- **Seade:** push-teavituste märk (Expo push token) ja platvorm, kui lubad teavitused.
- **Tehnilised logid:** päringu meetod, aadressi tee, olekukood ja kestus. Logides ei ole IP-aadressi, päringu parameetreid (nt koordinaate), e-posti aadresse ega küpsiseid.

Fotodelt eemaldatakse enne salvestamist EXIF-andmed, sh GPS-asukoht. Me ei kasuta reklaamiteenuseid, analüütikat ega jälgimist ning ei müü andmeid.

## 3. Eesmärgid ja õiguslikud alused

- **Lepingu täitmine** (IKÜM art 6 lg 1 p b): konto, profiil, koerad ja tervisekirjed, kohalolek, plaanid, sõbrad ja sõnumid, broneeringud, Käpad ning teenusega seotud e-kirjad (parooli taastamine, e-posti kinnitus, konto kustutamise kinnitus). Turunduskirju me ei saada.
- **Nõusolek** (art 6 lg 1 p a): seadme asukoha kasutamine lähimate parkide leidmiseks ja push-teavitused. Nõusoleku annad ja võtad tagasi seadme lubadega (Seaded → Käpp) ning teavituste liike saad valida äpis (Seaded → Teavitused).
- **Õigustatud huvi** (art 6 lg 1 p f): kasutajate turvalisus ja modereerimine (blokeeringud, teated, sisu ülevaatus), kuritarvituste vältimine (kiiruspiirangud), tehnilised logid vigade leidmiseks ning varukoopiad andmete taastamiseks.

## 4. Mida näevad teised kasutajad

- Teised näevad sinu eesnime, piirkonda ning koerte nimesid ja tõuge; sõbrad näevad lisaks tutvustust ning koerte vanust ja iseloomu.
- Kohalolekut pargis näevad need, kellele oled selle seadetes lubanud (mitte keegi, sõbrad või kõik).
- Hinnangud ja avaldatud kohasoovitused on avalikud koos sinu eesnimega.
- Sõnumeid näevad ainult vestluse osalised. Blokeeritud kasutaja ei näe sind kusagil.

## 5. Volitatud töötlejad ja vastuvõtjad

- **Serveri majutus, andmebaas ja järjekorrad:** teenusepakkuja Euroopa Liidus [täpsusta enne avaldamist, nt Hetzner Online GmbH, Saksamaa].
- **Failihoidla (fotod):** Cloudflare R2, andmed hoitakse EL-i jurisdiktsiooniga hoidlas.
- **Push-teavitused:** Expo (650 Industries, Inc.) ning Apple Push Notification service ja Google Firebase Cloud Messaging. Teavitus sisaldab saatja eesnime ja kuni 120 märgi pikkust sõnumi eelvaadet.
- **E-kirjad:** e-posti saatmise teenus [täpsusta enne avaldamist: Resend EL-i piirkonnaga või muu SMTP-teenus]. Teenus näeb saaja aadressi ja kirja sisu.
- **Kaardiplaadid:** OpenFreeMap. Seade laadib kaardiplaadid otse, teenus näeb seadme IP-aadressi ja vaadatavat piirkonda.
- **Sisselogimine:** Apple või Google, kui valid nendega sisselogimise.
- **Äpi ehitamine:** Expo Application Services (EAS) näeb ainult äpi lähtekoodi, mitte kasutajaandmeid.

Andmeid avaldame ametiasutustele ainult seadusest tuleneva kohustuse korral.

## 6. Edastamine väljapoole Euroopa Liitu

Expo, Apple, Google, Cloudflare ja e-posti teenuse pakkuja võivad olla USA ettevõtted. Edastamine toimub EL–USA andmekaitseraamistiku (Data Privacy Framework) või Euroopa Komisjoni standardsete lepingutingimuste alusel [kontrolli enne avaldamist iga pakkuja kehtiv alus].

## 7. Kui kaua andmeid hoiame

- **Konto, profiil, koerad, tervisekirjed, fotod, kohalolekute ajalugu, plaanid, hinnangud, soovitused, broneeringud ja Käpad:** kuni konto kustutamiseni. Kohalolek lõpeb ise hiljemalt valitud aja möödudes, ajalugu jääb sulle nähtavaks.
- **Sõnumid:** sinu saadetud sõnumid jäävad vestluskaaslasele alles, kuni tema kustutab oma konto. Kui sina kustutad konto, näeb ta neid edasi nime „Kustutatud kasutaja" all, ilma seoseta sinu kontoga. Kui mõlemad osalised on konto kustutanud, kustutatakse vestlus täielikult.
- **Teated:** nii sinu esitatud kui ka sinu kohta esitatud teated kustutatakse koos sinu kontoga. Lühemat automaatset tähtaega praegu ei ole.
- **Sessioon:** kuni 30 päeva viimasest kasutamisest. Parooli taastamise link kehtib 1 tunni, e-posti kinnituslink 24 tundi.
- **Push-märk:** kuni väljalogimise, märgi aegumise või konto kustutamiseni.
- **E-kirjade järjekord:** saaja aadress ja link eemaldatakse järjekorrast kohe pärast saatmist või viimast ebaõnnestunud katset.
- **Üleslaaditud toorfailid:** kustutatakse kohe pärast töötlemist, hiljemalt 1 päeva pärast.
- **Serveri logid:** kuni 30 päeva.
- **Varukoopiad:** kuni 30 päeva. Kustutatud andmed kaovad varukoopiatest hiljemalt 30 päeva pärast.

## 8. Sinu õigused ja kuidas neid kasutada

- **Juurdepääs ja andmete ülekandmine:** Seaded → Privaatsus ja tingimused → „Laadi minu andmed alla" annab sinu andmed masinloetaval kujul (JSON).
- **Parandamine:** profiili, koerte ja muud andmeid saad äpis ise muuta.
- **Kustutamine:** Seaded → Konto → „Kustuta konto". Kustutamine on kohene ja lõplik; fotod kustutatakse failihoidlast mõne minuti jooksul.
- **Nõusoleku tagasivõtmine:** asukoha ja teavituste load seadme seadetes. Tagasivõtmine ei muuda varasemat töötlemist ebaseaduslikuks.
- **Vastuväide ja töötlemise piiramine:** kirjuta vastutavale töötlejale (punkt 1). Vastame ühe kuu jooksul.
- **Kaebus:** Andmekaitse Inspektsioon, [www.aki.ee](https://www.aki.ee).

## 9. Lapsed

Käppa võivad kasutada vähemalt 13-aastased (isikuandmete kaitse seaduse § 8). Kui oled noorem, palun ära loo kontot. Kui saame teada, et konto kuulub alla 13-aastasele, kustutame selle.

## 10. Turvalisus

Ühendus serveriga on krüpteeritud (HTTPS), paroolid on räsitud (scrypt), sessioon on seadme turvalises hoidlas (iOS Keychain / Android Keystore), failihoidla on privaatne ja fotodele antakse ainult lühiajalised lingid.

## 11. Muudatused

Kui privaatsuspoliitika muutub, avaldame uue versiooni ja äpp küsib sinult uuesti nõustumist. Varasemad versioonid saad küsida vastutavalt töötlejalt.

## 12. Kontakt

[Vastutav töötleja: nimi, registrikood, e-post]
