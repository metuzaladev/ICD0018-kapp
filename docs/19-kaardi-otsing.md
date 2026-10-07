# 19. Kaardi otsing ja suumimine

Kaardi ülemine otsinguväli pakub kirjutamise ajal valikuid ja viib kaardi valitud kohta. Kaardil on ka nupud „+“ ja „−“.

## Mida otsing leiab

| Allikas | Mis | Kust |
|---|---|---|
| Käpa pargid | kinnitatud koertepargid ja ujumiskohad nime või aadressi järgi | oma andmebaas |
| Teenused | hooldus, trenn, kliinikud nime järgi | oma andmebaas |
| Kogukonna soovitused | kinnitatud soovitused nime järgi (blokeeritud autorite omi ei näidata) | oma andmebaas |
| Aadressid | majad, tänavad, katastriüksused, külad, vallad ja linnad | Maa-ameti aadressiandmete süsteem In-ADS |

Käpa kohad tulevad nimekirjas esimesena, sest neid rakenduses otsitakse. Aadressid on eraldi pealkirja „Aadressid“ all.

**Järjestus:**
- Käpa kohtades on eespool need, mille nimi algab otsitava sõnaga, siis lähimad (kaardi keskpunktist).
- Aadressides on eespool linnad, vallad ja külad (kirjutad „Tartu“ → Tartu linn), siis lähimad.
- Igast allikast näidatakse kuni 5 kohta ja kuni 4 aadressi.

**Valik viib kaardi kohale** suumiga, mis koha ära mahutab: maja 17, tänav 15, linn või vald 12, Käpa koht 15. Aadressi kohale tuleb otsingu nööpnõel, sest muud märki seal pole. Teenusepakkuja valimisel avaneb ka tema kaart (aja broneerimiseks). „Enter“ valib esimese soovituse.

Otsing ei peida enam kaardilt kohti nime järgi. Varem jäi aadressi kirjutades kaart tühjaks ja kadus ka „Lähim park“.

## Miks In-ADS

- Ametlik Eesti aadressiregister: tunneb iga maja, tänavat, küla ja katastriüksust.
- Tasuta, ei vaja võtit.
- Selle kasutustingimused lubavad otsingut kirjutamise ajal. Nominatimi omad ei luba.

Rakendus ei pöördu In-ADS-i poole ise, vaid läbi Käpa API (`GET /api/v1/search`):
- üks koht ajapiirangu (vaikimisi 2,5 s), vahemälu (sama päring 10 min) ja päringupiirangu (120 minutis) jaoks;
- rakendus ei sõltu kolmanda osapoole aadressist.

**Kui In-ADS ei vasta**, ei ebaõnnestu otsing: tulevad Käpa enda kohad ja nimekirja all on märge „Aadresse ei saanud praegu otsida“. Logisse läheb ainult viga, mitte otsitud tekst (see võib olla kellegi kodune aadress).

## Seaded (`apps/api/.env`)

| Muutuja | Vaikimisi | Tähendus |
|---|---|---|
| `ADDRESS_SEARCH_URL` | `https://inaadress.maaamet.ee/inaadress/gazetteer` | In-ADS aadress |
| `ADDRESS_SEARCH_ENABLED` | `true` | `false` = otsitakse ainult Käpa kohti |
| `ADDRESS_SEARCH_TIMEOUT_MS` | `2500` | kauem vastus jäetakse kõrvale |

## Suumimine

Kaart oli ka varem kahe sõrmega suumitav. Lisaks on nüüd paremal nupud „+“ ja „−“:
- ühe käega kasutamiseks;
- VoiceOveri kasutajatele, kes ei saa näpuga suumida.

Üks vajutus muudab suumi ühe taseme võrra (6 = kogu Eesti, 19 = üks hoov). Pärast näpuga suumimist liigub nupp järgmise täistasemeni. Kiired järjestikused vajutused liituvad. Kui „Vähenda liikumist“ on sees, liigub kaart hüppega.

## Testid

- **API ühiktestid** (`test/unit/search.test.ts`):
  - päringu reeglid;
  - aadressi teisendus ja suum aadressi liigi järgi;
  - vahemälu ja selle piir;
  - In-ADS-i viga, võrguviga ja ajapiirang;
  - topelttulemuste eemaldamine ja järjestus;
  - andmebaasi ajapiirang (503).
- **API HTTP-testid** (`test/http/search.routes.test.ts`): avalik ligipääs, sisseloginud vaataja, 400-vead (ka inglise keeles), 503.
- **Integratsioonitest** (`test/integration/search.flow.test.ts`, päris PostgreSQL):
  - ainult kinnitatud pargid ja soovitused;
  - aadressi järgi otsimine;
  - blokeeritud autorid peidetud;
  - prefiksi ja kauguse järjestus;
  - `%` ja `_` loetakse tavaliste tähtedena.
- **Rakenduse testid** (`apps/mobile/test/map-search.test.ts`): suumisammud, ikoonid, minimaalne otsingupikkus, lehe valik.
