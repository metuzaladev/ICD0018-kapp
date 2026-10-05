# Käpp privacy policy

**Version 2026-10-05.** This document describes which personal data the Käpp app and server process, why, for how long, with whom they are shared and how you can exercise your rights. The Estonian version is the original.

## 1. Controller

[Vastutav töötleja: nimi, registrikood, e-post]

Käpp is a student project created in the TalTech course ICD0018. For any privacy question, write to the email address above.

## 2. Data we process

- **Account:** name, email address, a hash of your password (we never see or store the password itself), your Apple or Google account identifier if you sign in with them, the app language, whether your email is confirmed, and which version of the terms and privacy policy you accepted and when.
- **Profile and settings:** area, bio, presence sharing setting, friend request setting, notification preferences.
- **Dogs:** name, breed, sex, birthday, weight, temperament and photos. **Health records** (vaccinations, vet visits, clinic, notes) are visible only to you.
- **Presence and plans:** which park you checked in to or plan to visit, and when. We do not store your device's precise location: to find nearby parks the app sends coordinates with the request, and the server only uses them to compute the answer and never writes them to logs.
- **Community:** friends and friend requests, messages, blocks, the notification feed and reports (those you filed and those filed about you).
- **Content you add:** park reviews, park issue reports, place recommendations with photos, likes and saves.
- **Services and Käpad:** bookings (service, time, dogs, note), your Käpad points history and balance, discount codes and invites.
- **Device:** the push notification token (Expo push token) and platform, if you allow notifications.
- **Technical logs:** request method, path, status code and duration. Logs contain no IP addresses, query parameters (such as coordinates), email addresses or cookies.

EXIF data, including the GPS location, is removed from photos before they are stored. We use no advertising, analytics or tracking and do not sell data.

## 3. Purposes and legal bases

- **Performance of a contract** (GDPR Art. 6(1)(b)): account, profile, dogs and health records, presence, plans, friends and messages, bookings, Käpad, and service emails (password reset, email confirmation, account deletion confirmation). We send no marketing emails.
- **Consent** (Art. 6(1)(a)): using the device location to find nearby parks, and push notifications. You give and withdraw consent through the device permissions (Settings → Käpp) and choose notification types in the app (Settings → Notifications).
- **Legitimate interests** (Art. 6(1)(f)): user safety and moderation (blocks, reports, content review), preventing abuse (rate limits), technical logs for finding errors, and backups for restoring data.

## 4. What other users see

- Others see your first name, area, and your dogs' names and breeds; friends also see your bio and your dogs' age and temperament.
- Your presence in a park is visible to the people you allow in your settings (nobody, friends or everyone).
- Reviews and published place recommendations are public with your first name.
- Messages are visible only to the people in the conversation. A blocked user cannot see you anywhere.

## 5. Processors and recipients

- **Server hosting, database and queues:** a hosting provider in the European Union [specify before publishing, e.g. Hetzner Online GmbH, Germany].
- **File storage (photos):** Cloudflare R2, data kept in a bucket with EU jurisdiction.
- **Push notifications:** Expo (650 Industries, Inc.) and Apple Push Notification service and Google Firebase Cloud Messaging. A notification contains the sender's first name and a message preview of up to 120 characters.
- **Emails:** an email delivery service [specify before publishing: Resend with the EU region or another SMTP service]. It sees the recipient's address and the content of the email.
- **Map tiles:** OpenFreeMap. The device loads map tiles directly; the service sees the device's IP address and the area being viewed.
- **Sign-in:** Apple or Google, if you choose to sign in with them.
- **App builds:** Expo Application Services (EAS) only sees the app's source code, not user data.

We disclose data to authorities only where the law requires it.

## 6. Transfers outside the European Union

Expo, Apple, Google, Cloudflare and the email provider may be US companies. Transfers rely on the EU–US Data Privacy Framework or the European Commission's standard contractual clauses [check each provider's current basis before publishing].

## 7. How long we keep data

- **Account, profile, dogs, health records, photos, presence history, plans, reviews, recommendations, bookings and Käpad:** until you delete your account. A check-in ends by itself after the chosen time at the latest; the history stays visible to you.
- **Messages:** messages you sent stay with the other person until they delete their own account. If you delete your account, they keep seeing them under "Deleted user", without any link to your account. When both people have deleted their accounts, the conversation is deleted completely.
- **Reports:** reports you filed and reports filed about you are deleted together with your account. There is currently no shorter automatic period.
- **Session:** up to 30 days after you last used the app. A password reset link is valid for 1 hour, an email confirmation link for 24 hours.
- **Push token:** until you sign out, the token expires or you delete your account.
- **Email queue:** the recipient's address and the link are removed from the queue right after sending or after the last failed attempt.
- **Raw uploads:** deleted right after processing, at the latest after 1 day.
- **Server logs:** up to 30 days.
- **Backups:** up to 30 days. Deleted data disappears from backups after 30 days at the latest.

## 8. Your rights and how to use them

- **Access and data portability:** Settings → Privacy & terms → "Download my data" gives you your data in a machine-readable format (JSON).
- **Rectification:** you can change your profile, dogs and other data in the app.
- **Erasure:** Settings → Account → "Delete account". Deletion is immediate and permanent; photos are removed from file storage within minutes.
- **Withdrawing consent:** location and notification permissions in the device settings. Withdrawal does not make earlier processing unlawful.
- **Objection and restriction:** write to the controller (section 1). We answer within one month.
- **Complaint:** the Estonian Data Protection Inspectorate, [www.aki.ee](https://www.aki.ee).

## 9. Children

Käpp may be used by people aged 13 or older (Estonian Personal Data Protection Act § 8). If you are younger, please do not create an account. If we learn that an account belongs to someone under 13, we delete it.

## 10. Security

The connection to the server is encrypted (HTTPS), passwords are hashed (scrypt), the session is kept in the device's secure storage (iOS Keychain / Android Keystore), file storage is private and photos are only served through short-lived links.

## 11. Changes

When the privacy policy changes, we publish a new version and the app asks you to accept it again. You can ask the controller for earlier versions.

## 12. Contact

[Vastutav töötleja: nimi, registrikood, e-post]
