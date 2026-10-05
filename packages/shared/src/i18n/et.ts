/**
 * Estonian message table — the source language and the fallback for everything.
 *
 * Shared by the API (`{ error, message }` texts, translated per Accept-Language) and the app
 * (inline field errors from the same Zod schemas). en.ts and ru.ts must have exactly these keys
 * (enforced by the type `Messages`) and the same `{{param}}` placeholders (enforced by
 * `npm run i18n:check` and apps/api/test/unit/i18n-messages.test.ts).
 *
 * Keys: `validation.*` = Zod issue texts (predicates without the field name, lower case, so they can
 * follow `Väli "x"`), `errors.*` = API errors, `auth.*` = Better Auth errors (modules/auth/auth-errors.ts).
 */
export const et = {
  /* ---------- validation: generic texts per Zod issue code ---------- */
  'validation.invalidType': 'puudub või on vale tüüpi',
  'validation.tooSmall': 'on liiga lühike või väike',
  'validation.tooBig': 'on liiga pikk või suur',
  'validation.invalidFormat': 'on vales vormingus',
  'validation.invalidValue': 'ei ole lubatud väärtus',
  'validation.invalid': 'on vigane',
  'validation.unknownKeys': 'tundmatud väljad: {{keys}}',
  /** Sentence around a generic predicate: `Väli "lat" on liiga pikk või suur`. */
  'validation.fieldGeneric': 'Väli "{{field}}" {{problem}}',
  /** Sentence around a schema's own message: `Väli "nextDue" järgmine tähtaeg peab olema pärast kuupäeva`. */
  'validation.fieldCustom': 'Väli "{{field}}" {{problem}}',
  /** Field name used when an issue has no path (whole body/query). */
  'validation.request': 'päring',
  'validation.invalidRequest': 'Vigane päring',

  /* ---------- validation: schema-specific texts (`kapp:` messages in schemas.ts) ---------- */
  'validation.email': 'sisesta korrektne e-posti aadress',
  'validation.minChars': 'vähemalt {{min}} märki',
  'validation.maxChars': 'kuni {{max}} märki',
  'validation.passwordRequired': 'sisesta parool',
  'validation.changeAtLeastOne': 'muuda vähemalt üht välja',
  'validation.dateFormat': 'kuupäev kujul AAAA-KK-PP',
  'validation.birthDateFuture': 'sünnipäev ei saa olla tulevikus',
  'validation.checkYear': 'kontrolli aastat',
  'validation.nameRequired': 'sisesta nimi',
  'validation.weightPositive': 'kaal peab olema positiivne',
  'validation.checkWeight': 'kontrolli kaalu',
  'validation.photoType': 'toetatud on JPEG, PNG, WebP ja HEIC',
  'validation.photoTooLarge': 'pilt võib olla kuni {{max}} MB',
  'validation.uploadKey': 'vigane üleslaadimise võti',
  'validation.titleRequired': 'sisesta nimetus',
  'validation.dateFuture': 'kuupäev ei saa olla tulevikus',
  'validation.nextDueAfterDate': 'järgmine tähtaeg peab olema pärast kuupäeva',
  'validation.chooseDog': 'vali vähemalt üks koer',
  'validation.duplicateDog': 'sama koer on valitud kaks korda',
  'validation.startInvalid': 'vigane algusaeg',
  'validation.endInvalid': 'vigane lõpuaeg',
  'validation.startInPast': 'algus ei saa olla minevikus',
  'validation.planMaxDays': 'planeeri kuni {{max}} päeva ette',
  'validation.endBeforeStart': 'lõpp peab olema pärast algust',
  'validation.planMaxHours': 'kuni {{max}} tundi',
  'validation.rating': 'vali 1–5',
  'validation.describeMin': 'kirjelda vähemalt {{min}} märgiga',
  'validation.userId': 'vigane kasutaja ID',
  'validation.searchMin': 'sisesta vähemalt {{min}} tähte',
  'validation.messageEmpty': 'kirjuta sõnum',
  'validation.pushToken': 'ei ole Expo push-märk',
  'validation.bothCoordinates': 'anna nii lat kui ka lng',
  'validation.maxDogs': 'kuni {{max}} koera',

  /* ---------- API errors ---------- */
  'errors.badRequest': 'Vigane päring',
  'errors.unauthorized': 'Palun logi sisse',
  'errors.forbidden': 'Sul pole selleks õigust',
  'errors.notFound': 'Ei leitud',
  'errors.conflict': 'Andmed muutusid vahepeal, proovi uuesti',
  'errors.tooManyRequests': 'Liiga palju päringuid, proovi hetke pärast uuesti',
  'errors.serviceUnavailable': 'Teenus ei vasta, proovi hetke pärast uuesti',
  'errors.server': 'Serveri viga, proovi hiljem uuesti',
  'errors.routeNotFound': 'Sellist aadressi pole',
  'errors.bodyMissing': 'Päringu sisu puudub',
  'errors.bodyInvalidJson': 'Päringu sisu ei ole korrektne JSON',
  'errors.unsupportedMediaType': 'Toetatud on ainult application/json',
  'errors.bodyTooLarge': 'Päringu sisu on liiga suur',
  'errors.parkNotFound': 'Parki ei leitud',
  'errors.dogNotFound': 'Koera ei leitud',
  'errors.dogLimit': 'Kuni {{max}} koera kasutaja kohta',
  'errors.userNotFound': 'Kasutajat ei leitud',
  'errors.visitNotFound': 'Külastust ei leitud',
  'errors.planNotFound': 'Plaani ei leitud',
  'errors.checkInExists': 'Kohalolek on juba märgitud, värskenda vaadet',
  'errors.reviewNeedsVisit': 'Hinnata saab parki, mida oled külastanud',
  'errors.healthRecordNotFound': 'Tervisekirjet ei leitud',
  /** Same wording as `validation.fieldCustom` + `validation.nextDueAfterDate`, so device and server agree. */
  'errors.nextDueBeforeDate': 'Väli "nextDue" järgmine tähtaeg peab olema pärast kuupäeva',
  'errors.photoNotFound': 'Fotot ei leitud',
  'errors.uploadNotFound': 'Üleslaaditud pilti ei leitud, proovi uuesti',
  'errors.photoTooLarge': 'Pilt võib olla kuni {{max}} MB',
  'errors.notAnImage': 'Faili ei saanud pildina lugeda, proovi JPEG- või PNG-pildiga',
  'errors.photoLimit': 'Kuni {{max}} fotot koera kohta',
  'errors.storageUnavailable': 'Pildihoidla ei vasta, proovi hetke pärast uuesti',
  'errors.cannotFriendSelf': 'Iseendale ei saa sõbrakutset saata',
  'errors.friendRequestsDisabled': 'See kasutaja ei võta praegu sõbrakutseid vastu',
  'errors.friendRequestNotFound': 'Sõbrakutset ei leitud',
  'errors.messagesFriendsOnly': 'Sõnumeid saab saata ainult sõpradele',
  'errors.conversationNotFound': 'Vestlust ei leitud',
  'errors.notificationNotFound': 'Teadet ei leitud',
  'errors.cannotBlockSelf': 'Iseennast ei saa blokeerida',
  'errors.cannotReportSelf': 'Iseendast ei saa teavitada',
  'errors.providerNotFound': 'Teenusepakkujat ei leitud',
  'errors.serviceNotFound': 'Teenust ei leitud',
  'errors.bookingNotFound': 'Broneeringut ei leitud',
  'errors.slotUnavailable': 'See aeg ei ole broneeritav, vali teine aeg',
  'errors.slotTaken': 'Keegi jõudis selle aja just broneerida, vali teine aeg',
  'errors.cancelTooLate': 'Tühistada saab kuni {{hours}} tundi enne algust',

  /* ---------- push notifications (written in the recipient's language, docs/12-kogukond.md) ---------- */
  'push.friendRequest.title': 'Uus sõbrakutse',
  'push.friendRequest.body': '{{name}} tahab sinuga sõbraks saada',
  'push.friendAccepted.title': 'Uus sõber',
  'push.friendAccepted.body': '{{name}} võttis sinu sõbrakutse vastu',
  'push.message.title': '{{name}} saatis sõnumi',
  'push.friendPlan.title': '{{name}} läheb parki',
  'push.friendPlan.body': '{{park}} · {{when}}',
  'push.bookingConfirmed.title': 'Broneering on kirjas',
  'push.bookingCancelled.title': 'Broneering tühistatud',
  'push.bookingReminder.title': 'Kohtumiseni varsti!',
  'push.booking.body': '{{service}} · {{provider}} · {{when}}',

  /* ---------- Better Auth errors ---------- */
  'auth.userExists': 'Selle e-postiga konto on juba olemas',
  'auth.invalidCredentials': 'Vale e-post või parool',
  'auth.invalidPassword': 'Vale parool',
  'auth.invalidEmail': 'Sisesta korrektne e-posti aadress',
  'auth.passwordTooShort': 'Parool on liiga lühike',
  'auth.passwordTooLong': 'Parool on liiga pikk',
  'auth.invalidName': 'Nimi peab olema 2–60 märki',
  'auth.invalidToken': 'Link on aegunud või vigane, küsi uus',
  'auth.emailNotVerified': 'Kinnita oma e-posti aadress',
  'auth.userNotFound': 'Kasutajat ei leitud',
  'auth.createUserFailed': 'Kontot ei õnnestunud luua, proovi uuesti',
  'auth.unprocessable': 'Andmed ei sobi',
  'auth.tooManyAttempts': 'Liiga palju katseid, proovi hetke pärast uuesti',
} as const;

export type MessageKey = keyof typeof et;
/** Every language must translate every key — a missing or extra key is a compile error. */
export type Messages = Record<MessageKey, string>;
