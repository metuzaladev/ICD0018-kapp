# 18. Avalehe tegevus, kaardi klastrid ja tekstid (M11)

Tootejuhi tagasiside pärast 71 päris koertepargi lisamist:

> Avaleht võiks näidata teiste postitusi ja seda, kas lemmikparki on minemas koeri, näiteks õhtul. Kaart on natuke katki ja üleval otsingus need käpad ei ole ilusasti. Kindlasti tuleb osa teksti üle vaadata, et see oleks loogiline.

| Mure | Lahendus |
|---|---|
| Avalehelt ei näe, kas lemmikparki keegi tuleb | **„Lemmikparkides täna"**: koerad praegu + tänased plaanid hommikul / päeval / õhtul, sõbrad nimega (`GET /parks/activity`) |
| Avalehel pole teiste postitusi | **„Kogukonna soovitused"**: kolm uusimat heakskiidetud soovitust lähedal, „Vaata kõiki" → Avasta |
| Kaardil on 71 nööpnõela üksteise peal ja üle siltide | Klastrid (`supercluster`), kaart avaneb linna suumil, mitte kogu Eesti kohal |
| Käppade märk otsinguväljas istub kõrgel | 32 pt pill, tsentreeritud, võrdne 10 pt vahe |
| Tekstid pole loogilised | Ülevaade ekraanide kaupa, tabel [docs/11](11-tolked-ja-figma.md#m11-tekstide-ülevaade) |

## „Lemmikparkides täna"

```
Avaleht ─ useFavoriteParks ─┬─ lemmikud olemas → kuni 3 lemmikut
                            └─ lemmikuid pole  → 2 lähimat koerteparki + „Lisa lemmikpark"
        └─ useParkActivity(ids) → GET /api/v1/parks/activity?ids=a,b,c
```

### Endpoint

`GET /api/v1/parks/activity?ids=<uuid>,<uuid>…` (sessioon nõutud, 1–10 ID-d, korduvad eemaldatakse)

```json
{
  "date": "2026-10-05",
  "parks": [
    {
      "id": "…", "name": "Kadrioru koertepark",
      "activeDogs": 2,
      "planned": { "morning": 0, "day": 1, "evening": 4 },
      "friends": [{ "firstName": "Mari", "part": "evening" }]
    }
  ]
}
```

- **Järjekord** on sama mis päringus; olematu või mitteavalik park jäetakse vastusest välja (ainult mitteavalik → `200` tühja nimekirjaga). Nii ei saa vastusest teada, kas ID on olemas — sama garantii mis `GET /parks/:id` `404`-l, aga üks puuduv park ei nurjata teiste vastust.
- **`activeDogs`** on sama avalik loendur mis kaardi nööpnõelal („6 koera praegu"), varjatud omanike koerad kaasa arvatud (nagu M3 `hiddenDogs`).
- **`planned`** = **teiste inimeste** plaanid, mis kattuvad selle päevaosaga ja pole veel läbi, iga inimene korra. Plaanidel pole koeri (`planned_visits` hoiab ainult kasutajat), seega äpp ütleb „Õhtul: 4 plaanitud külastust", mitte „4 koera". Möödunud päevaosa on `0`. Oma plaane ei loeta: need on avalehel eraldi ja „kes veel tuleb" oleks muidu eksitav.
- **Päevaosad** Tallinna ajas: hommik `00–12`, päev `12–17`, õhtu `17–24` (poolavatud vahemikud). Plaan 16.30–17.30 on mõlemas, sest iga arv vastab küsimusele „kes on seal pärastlõunal / õhtul". Puhtad funktsioonid `modules/park-activity/day-parts.ts`: päeva piirid arvutatakse `Intl`-i abil (sama lähenemine mis `lib/calendar.ts`), 23- ja 25-tunnine suveaja vahetuse päev on üks päev.
- **`friends`**: kuni 5 aktsepteeritud sõpra plaanijate seas, eesnimi ja esimene päevaosa, kus nad tulevad. **ID-sid ei tagastata.**
- Õhtul pärast keskööd lõppev plaan (23.00–00.30) loetakse tänase õhtu alla.
- `withTimeout` mõlemal päringul, `503` aegumisel; globaalne kiiruspiirang (lugemine, ≤ 10 parki, kaks indekseeritud päringut).

**Miks `?ids=`, mitte `/me/favorites/activity`:** avaleht küsib lemmikuid või nende puudumisel lähimaid parke, ja mõlemad nimekirjad on äpis juba vahemälus. Üks endpoint teenindab mõlemat juhtumit ilma serveripoolse lemmikute lugemiseta; sessioon on vajalik, sest loendus sõltub vaataja sõprustest ja blokeeringutest.

### Privaatsus

Reegel on SQL-is (`park-activity.repository.ts`), seega plaan, mida vaataja ei tohi näha, ei lahku andmebaasist:

| Plaani omaniku `presenceSharing` | Loetakse vaatajale | Nimi |
|---|---|---|
| `everyone` | kõigile sisseloginud vaatajatele | ainult kui vaataja on sõber |
| `friends` | ainult aktsepteeritud sõpradele | jah (sõbrale) |
| `nobody` | **mitte kellelegi** | — |
| blokeering kummaski suunas | ei loeta | — |

- **Miks `friends` ei lähe võõraste arvu sisse** (erinevalt M3 `hiddenDogs`-ist): `hiddenDogs` loendab koeri, kes on pargis *praegu* — seda näeb kohapeal igaüks oma silmaga. Plaan on ennustus, kus inimene *tuleb olema*; „sõpradele" valinud inimene pole nõustunud, et võõrad teavad tema tulevast asukohta isegi arvuna. Sama loogika nagu M5 sõprade plaanides: kes ei jaga, kus ta on, ei taha jagada ka seda, kus ta homme on.
- **Väikese arvu reeglit pole vaja:** arvu sisse lähevad ainult need, kes on valinud, et see vaataja tohib nende kohalolekut näha. „1 plaanitud külastus" ei paljasta midagi, mida omanik poleks lubanud.
- Nimi loetakse SQL-is ainult sõbra puhul (`case when friendsBetween(...) then u.name end`) ja ainult eesnimi (`firstName`).
- Vt ka [docs/12 → M11](12-kogukond.md#m11-avalehe-pargitegevus).

### Äpp

`components/park-activity-section.tsx`: üks rida pargi kohta (VoiceOveris üks nupp → pargi leht):

```
Kadrioru koertepark
Praegu pargis 2 koera
Päeval: 1 plaanitud külastus
Õhtul: 4 plaanitud külastust
Sõbrad: Mari ja Jaan
```

Laadimisel skelett, veal `ErrorState` uuesti proovimisega, lemmikuteta `EmptyState` „Lisa lemmikpark" → parkide nimekiri (lemmikuks märgitakse pargi lehel südamega), lemmikutega nupp „Minu lemmikpargid". Päring on `['parks', 'activity', ids]` all, nii et check-in ja lemmiku muutus värskendavad seda koos teiste parkidega; `staleTime` 60 s. Puhas loogika `lib/home-activity.ts` (unit-testid).

## „Kogukonna soovitused"

Sama voog mis Avasta „Lähedal" (`usePlacePostFeed`, `limit: 5`), kuvatakse kolm uusimat **heakskiidetud** postitust (`communityPicks`): oma ootel postitus on Avastas „Ootab kinnitust" sildiga, avalehel mitte. Rida: pisipilt, nimi, kategooria pill (sama `map*` värv mis nööpnõelal), kaugus, „soovitas Mari", meeldimiste arv. „Vaata kõiki" lülitab Kaardi vahekaardi Avasta poolele (`setExploreView('feed')` + `router.navigate('/map')`, docs/16 olekupood). Tühjal juhul „Soovita kohta".

Tõmba-värskendamine avalehel hõlmab nüüd ka lemmikuid, pargitegevust ja soovitusi.

## Kaart: klastrid

- **`supercluster`** (puhas JS, **natiivset moodulit pole, uut development build'i pole vaja**). MapLibre'i enda GeoJSON-klasterdus vajaks nööpnõelu stiilikihtidena, aga meie nööpnõelad on Reacti vaated (koerte näod, VoiceOveri silt iga nööpnõela kohta), seega indeks on JS-is ja tulemus joonistatakse `Marker`-itena.
- Klasterdatakse vaiksed pargid ja kõik `/map/places` kohad. **Pargid, kus on praegu koeri, ei lähe klastrisse** ja on alati peal: elav kohalolek on äpi peamine signaal ja neid on korraga vähe, nii et eraldi joonistamine on odav. Klastrisse punkti „koerad sees" seega vaja pole.
- Klastri mull: brändiringis käpp ja arv, ≥ 44 pt (suureneb arvuga), VoiceOver „5 kohta, suumi lähemale". Puudutus → `getClusterExpansionZoom` (vähemalt üks tase sügavamale, kuni 17) klastri keskele.
- Klastrid arvutatakse nähtava ala ja suumi järgi `onRegionDidChange`-ist, 120 ms *debounce*'iga (kaamera animatsioon võib anda mitu sündmust järjest). Puhtad abifunktsioonid `lib/map-clusters.ts` + testid (päris indeks ja mock'itud indeks).
- **Algkaamera:** varem `fitBounds` üle kõigi parkide, mis 71 pargiga tähendas kogu Eestit. Nüüd avaneb kaart kasutaja (või Tallinna) kohal suumil 12,5 ja järgib üks kord, kui päris asukoht saabub. Pärast kasutaja enda liigutust või „Kaardil" fookust kaamerat enam automaatselt ei liigutata.
- **Kihid:** nööpnõelad on ankurdatud saba otsaga (`anchor="bottom"`), nii et nad seisavad koha *kohal*, mitte peal. iOS-is on `zIndex` (kiht `zPosition`) selgesõnaline: vaiksed 10, klastrid 20, koertega pargid 30, **kasutaja asukoht 100**. Natiivne asukohatäpp on kaardikiht ja jääb alati markerite alla, seepärast joonistatakse sama täpp (MapLibre `useCurrentPosition`, täpne asukoht, mitte API jaoks ümardatud) ka markerina kõige peale.
- Ülemine hajutus ulatub nüüd kiipide reani, nii et otsingu ja kiipide alla libisevad nööpnõelad hajuvad, mitte ei lõigu.

## „Lähim park" nupp

`nearestParkAction` (`lib/home-activity.ts`): ≤ 300 m → **„Oleme siin"** (check-in), kaugemal → **„Juhata kohale"** (jalgsi teejuhised, sama mis pargi lehel), asukohata (Tallinna kesklinn) → **„Vaata parki"**, juba seal → „Oled siin". Check-in jääb alati pargi lehele. Avalehe „Lähim park" eelistab koerteparki ujumiskohale nagu kaart.

## Testid

- **API unit** (`test/unit/m11-park-activity.test.ts`): Tallinna kell talvel/suvel, kesköö kevadise ja sügisese kellakeeramise ümber, 23/25-tunnine päev, UTC vs Tallinna kuupäev kesköö järel ja aastavahetusel, poolavatud piirid, mitme päevaosa plaan, inimene üks kord, möödunud plaanid ja päevaosad, kesköö ületav plaan, sõbrad üks kord ja max 5, skeem (1–10 UUID-d, duplikaadid), teenus (järjekord, puuduvad välja, plaanipäringut ei tehta tühja nimekirjaga, ajapiirang).
- **HTTP** (`test/http/m11.routes.test.ts`): 401 enne valideerimist, 200, `/parks/:parkId` ei varja marsruuti, 400 (puudub, tühi, mitte-UUID, 11 ID-d), inglise keeles viga, 503.
- **Integratsioon** (`test/integration/park-activity.flow.test.ts`, päris PostgreSQL): `everyone` ja sõber loetakse, `friends` võõrana ei, `nobody` (ka sõbrana) ei, blokeering mõlemas suunas ei, oma plaan ei, sama inimese kaks plaani üks kord, möödunud ja homne plaan ei, ootel park välja, nimi ainult sõbral, vastuses pole ID-sid, `activeDogs` sisaldab varjatud omanikku, 401.
- **Äpp** (`test/map-clusters.test.ts`, `test/home-activity.test.ts`, `test/count-labels.test.ts`): klastrite tunnused, kast, suum, laienemine, *debounce*; lemmikud/varuvariant, päevaosad, soovituste filter, „Oleme siin" kauguse järgi; „plaanitud külastus" ja nimeloend kolmes keeles.

## Mida pole kontrollitud

- **Simulaatoris ega seadmes pole midagi vaadatud.** Kontrollitud: `tsc`, lint, testid, `i18n:check`, `a11y:check`, `expo export` (iOS bundle).
- Markerite `zIndex` järjestus on loetud MapLibre iOS-i lähtekoodist (`MLRNPointAnnotation setZIndex` → `layer.zPosition`); Androidi `MarkerView` järjestust pole kontrollitud.
- Klastrite jõudlus väga paljude kohtadega (300 kohta + 71 parki) on mõõtmata; `supercluster` on selle mahu jaoks kiire, aga iga `Marker` on natiivne vaade.
- `useCurrentPosition` täpi ja natiivse täpi kattumine (sama punkt, kaks joonistust) on eeldatud.
- iOS 26 ujuva vahekaardiriba kõrgus: „Lähim park" kaart ja nupud kasutavad endiselt `insets.bottom + ios.tabBarHeight + 16`.
