#!/usr/bin/env python3
"""Conditions de vente de CallIt! Pro, dans les 5 langues du site.

Fabrique conditions/fr.html, it.html, en.html, de.html, es.html et conditions/index.html
(qui envoie vers la langue du navigateur). Pour changer un texte : modifier TEXTES ci-dessous,
puis lancer  python3 outils/conditions_vente.py  et vérifier les pages.

BROUILLON (27/11/2026) : en attente de la confirmation du code ATECO par le comptable
et de l'adresse à afficher. Ne pas mettre de lien vers ces pages dans l'appli avant.
"""
import html
import os

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, '..', 'conditions')

# Données du vendeur (certificat de partita IVA du 15/01/2026)
VENDEUR = {
    'nom': 'Jérémie François Axel Blevin',
    'piva': '18370091003',
    # Adresse du domicile fiscal : à confirmer par Jérémie avant publication (la loi italienne
    # demande l'adresse du siège sur le site). Tant qu'elle n'est pas confirmée, la page dit « Bracciano (RM) ».
    'adresse': 'Bracciano (RM)',
    'email': 'request@callitcards.com',
    'prix': '5',
    'gratuit': '5',
}
MAJ = {'fr': '27 novembre 2026', 'it': '27 novembre 2026', 'en': '27 November 2026', 'de': '27. November 2026', 'es': '27 de noviembre de 2026'}
BROUILLON = True

NOMS = {'fr': 'Français', 'it': 'Italiano', 'en': 'English', 'de': 'Deutsch', 'es': 'Español'}

TEXTES = {
'fr': {
  'titre': 'Conditions de vente de CallIt! Pro',
  'desc': "Conditions de vente de l'abonnement CallIt! Pro : prix, paiement, résiliation, rétractation.",
  'maj': 'Mise à jour : {maj}.',
  'brouillon': "Brouillon : ces conditions ne sont pas encore en vigueur, l'abonnement n'est pas encore ouvert.",
  'bref': "<b>En bref :</b> CallIt! reste gratuit. Avec un compte, tu as {gratuit} analyses d'état gratuites par semaine. CallIt! Pro, à {prix} € par mois TVA comprise, les rend illimitées. Sans engagement : tu résilies quand tu veux, en deux clics.",
  'sections': [
    ('Qui vend', [
      "CallIt! est édité et vendu par {nom}, entreprise individuelle (ditta individuale) immatriculée en Italie, partita IVA {piva}, siège : {adresse}, Italie.",
      'Contact : <a href="mailto:{email}">{email}</a>. On répond en français, en italien et en anglais.']),
    ('Ce que tu achètes', [
      "CallIt! Pro est un abonnement qui donne accès sans limite aux analyses d'état d'une carte : centrage, défauts visibles, note estimée et image à partager.",
      "Sans Pro, chaque compte a {gratuit} analyses gratuites par semaine (le compteur repart chaque lundi). Tout le reste de CallIt! (cote, collection, liste d'envies, scan…) reste gratuit.",
      "Il faut un compte CallIt! (gratuit) pour s'abonner. Pro est lié à ce compte et marche sur tous tes appareils connectés."]),
    ('Prix', [
      "{prix} € par mois, TVA comprise. Le prix exact est affiché sur la page de paiement avant que tu valides. Il n'y a pas d'autres frais.",
      "Si le prix change un jour, on te prévient par e-mail au moins 30 jours avant. Tu peux résilier avant que le nouveau prix s'applique."]),
    ('Paiement', [
      "Le paiement passe par Stripe, un prestataire de paiement agréé. Tu saisis ta carte (ou un autre moyen proposé) chez Stripe : CallIt! ne voit et ne garde jamais tes données bancaires.",
      "Le premier mois est payé à la souscription, puis chaque mois à la même date, jusqu'à ta résiliation. Tu reçois un reçu par e-mail à chaque paiement.",
      "Si un paiement échoue, Stripe réessaie pendant quelques jours. Sans paiement, ton compte repasse simplement en version gratuite."]),
    ('Durée et résiliation', [
      "L'abonnement est sans engagement. Tu peux le résilier à tout moment avec le bouton « Gérer mon abonnement » de l'appli, ou en nous écrivant.",
      "La résiliation prend effet à la fin du mois déjà payé : tu gardes Pro jusque-là, et plus rien n'est prélevé ensuite. Le mois en cours n'est pas remboursé, sauf en cas de rétractation (ci-dessous)."]),
    ('Droit de rétractation (14 jours)', [
      "Tu as 14 jours à partir de ta souscription pour te rétracter, sans donner de raison.",
      "Au paiement, tu demandes que Pro démarre tout de suite (case à cocher). Si tu te rétractes pendant ces 14 jours, on te rembourse les jours qui restent : tu ne paies que les jours où Pro a déjà servi (par exemple, après 10 jours sur 30, on te rend environ 3,30 €).",
      "Pour te rétracter : écris à <a href=\"mailto:{email}\">{email}</a> une phrase claire (par exemple : « Je me rétracte de mon abonnement CallIt! Pro », avec l'adresse e-mail de ton compte), ou utilise le formulaire ci-dessous. On te rembourse dans les 14 jours, avec le même moyen de paiement, sans frais."]),
    ('Ce que vaut une analyse', [
      "Une analyse est une estimation automatique faite à partir de tes photos. Elle dépend de leur qualité (lumière, netteté, cadrage). Ce n'est pas une note officielle : PSA, BGS, CGC et les autres sociétés de gradation sont indépendantes de CallIt! et décident seules de leurs notes.",
      "CallIt! ne garantit donc ni une note ni un prix de revente. Garde ton esprit critique avant d'envoyer une carte à grader ou de l'acheter."]),
    ('Garanties et responsabilité', [
      "Tu bénéficies de la garantie légale de conformité des contenus et services numériques prévue par la loi de ton pays : si Pro ne marche pas comme décrit, écris-nous et on corrige, ou on te rembourse.",
      "Si Pro est indisponible plusieurs jours de suite à cause de nous, on prolonge ton abonnement d'autant.",
      "En dehors de ces garanties légales, que rien ici ne limite, CallIt! n'est pas responsable des décisions d'achat, de vente ou de gradation prises à partir d'une analyse."]),
    ('Données personnelles', [
      'Pour l\'abonnement, on garde seulement l\'état de ton abonnement et les identifiants Stripe liés à ton compte. Détails : <a href="/confidentialite.html">politique de confidentialité</a>.']),
    ('Changement de ces conditions', [
      "Si ces conditions changent, on te prévient par e-mail au moins 30 jours avant. Si tu n'es pas d'accord, tu peux résilier avant la date de changement."]),
    ('Litiges et loi applicable', [
      "En cas de problème, écris-nous d'abord : on cherche toujours une solution à l'amiable.",
      "Ces conditions sont soumises au droit italien. Si tu es un consommateur, tu gardes toutes les protections de la loi de ton pays de résidence, et tu peux saisir le tribunal de ton lieu de résidence.",
      "Ces conditions existent en français, italien, anglais, allemand et espagnol. Toutes les versions ont la même valeur."]),
  ],
  'form_titre': 'Formulaire de rétractation',
  'form': "À envoyer à {nom}, {adresse}, Italie, <a href=\"mailto:{email}\">{email}</a> :<br>« Je vous informe par la présente que je me rétracte de mon contrat d'abonnement CallIt! Pro. Souscrit le : … · Nom : … · Adresse e-mail du compte : … · Date : … »",
  'retour': "Retour à CallIt!",
},
'it': {
  'titre': 'Condizioni di vendita di CallIt! Pro',
  'desc': "Condizioni di vendita dell'abbonamento CallIt! Pro: prezzo, pagamento, disdetta, recesso.",
  'maj': 'Aggiornamento: {maj}.',
  'brouillon': "Bozza: queste condizioni non sono ancora in vigore, l'abbonamento non è ancora aperto.",
  'bref': "<b>In breve:</b> CallIt! resta gratuito. Con un account hai {gratuit} analisi dello stato gratuite a settimana. CallIt! Pro, a {prix} € al mese IVA inclusa, le rende illimitate. Senza vincoli: disdici quando vuoi, in due clic.",
  'sections': [
    ('Chi vende', [
      "CallIt! è pubblicato e venduto da {nom}, ditta individuale con sede in Italia, partita IVA {piva}, sede: {adresse}, Italia.",
      'Contatto: <a href="mailto:{email}">{email}</a>. Rispondiamo in italiano, francese e inglese.']),
    ('Cosa acquisti', [
      "CallIt! Pro è un abbonamento che dà accesso illimitato alle analisi dello stato di una carta: centratura, difetti visibili, voto stimato e immagine da condividere.",
      "Senza Pro, ogni account ha {gratuit} analisi gratuite a settimana (il contatore riparte ogni lunedì). Tutto il resto di CallIt! (quotazioni, collezione, lista dei desideri, scansione…) resta gratuito.",
      "Per abbonarti serve un account CallIt! (gratuito). Pro è legato a questo account e funziona su tutti i tuoi dispositivi collegati."]),
    ('Prezzo', [
      "{prix} € al mese, IVA inclusa. Il prezzo esatto è indicato nella pagina di pagamento prima della conferma. Non ci sono altri costi.",
      "Se un giorno il prezzo cambia, ti avvisiamo per e-mail almeno 30 giorni prima. Puoi disdire prima che il nuovo prezzo si applichi."]),
    ('Pagamento', [
      "Il pagamento avviene tramite Stripe, un prestatore di servizi di pagamento autorizzato. Inserisci la tua carta (o un altro metodo proposto) su Stripe: CallIt! non vede e non conserva mai i tuoi dati bancari.",
      "Il primo mese si paga alla sottoscrizione, poi ogni mese alla stessa data, fino alla disdetta. Ricevi una ricevuta per e-mail a ogni pagamento.",
      "Se un pagamento non va a buon fine, Stripe riprova per qualche giorno. Senza pagamento, il tuo account torna semplicemente alla versione gratuita."]),
    ('Durata e disdetta', [
      "L'abbonamento è senza vincoli. Puoi disdirlo in qualsiasi momento con il pulsante « Gestisci il mio abbonamento » dell'app, oppure scrivendoci.",
      "La disdetta ha effetto alla fine del mese già pagato: mantieni Pro fino ad allora, poi non viene addebitato più nulla. Il mese in corso non viene rimborsato, salvo in caso di recesso (vedi sotto)."]),
    ('Diritto di recesso (14 giorni)', [
      "Hai 14 giorni dalla sottoscrizione per recedere, senza dover dare una motivazione.",
      "Al pagamento chiedi che Pro inizi subito (casella da spuntare). Se recedi entro questi 14 giorni, ti rimborsiamo i giorni rimanenti: paghi solo i giorni in cui Pro è già stato usato (ad esempio, dopo 10 giorni su 30, ti restituiamo circa 3,30 €).",
      "Per recedere: scrivi a <a href=\"mailto:{email}\">{email}</a> una frase chiara (ad esempio: « Recedo dal mio abbonamento CallIt! Pro », con l'indirizzo e-mail del tuo account), oppure usa il modulo qui sotto. Ti rimborsiamo entro 14 giorni, con lo stesso metodo di pagamento, senza costi."]),
    ("Cosa vale un'analisi", [
      "Un'analisi è una stima automatica fatta a partire dalle tue foto e dipende dalla loro qualità (luce, nitidezza, inquadratura). Non è un voto ufficiale: PSA, BGS, CGC e le altre società di gradazione sono indipendenti da CallIt! e decidono da sole i loro voti.",
      "CallIt! non garantisce quindi né un voto né un prezzo di rivendita. Usa il tuo giudizio prima di mandare una carta a gradare o di comprarla."]),
    ('Garanzie e responsabilità', [
      "Hai diritto alla garanzia legale di conformità dei contenuti e servizi digitali prevista dalla legge del tuo paese: se Pro non funziona come descritto, scrivici e lo sistemiamo, oppure ti rimborsiamo.",
      "Se Pro non è disponibile per più giorni di seguito per causa nostra, prolunghiamo il tuo abbonamento di altrettanto.",
      "Al di fuori di queste garanzie legali, che nulla qui limita, CallIt! non è responsabile delle decisioni di acquisto, vendita o gradazione prese sulla base di un'analisi."]),
    ('Dati personali', [
      'Per l\'abbonamento conserviamo solo lo stato del tuo abbonamento e gli identificativi Stripe legati al tuo account. Dettagli: <a href="/confidentialite.html">informativa sulla privacy</a>.']),
    ('Modifiche a queste condizioni', [
      "Se queste condizioni cambiano, ti avvisiamo per e-mail almeno 30 giorni prima. Se non sei d'accordo, puoi disdire prima della data della modifica."]),
    ('Controversie e legge applicabile', [
      "In caso di problemi, scrivici prima: cerchiamo sempre una soluzione amichevole.",
      "Queste condizioni sono regolate dalla legge italiana. Se sei un consumatore, mantieni tutte le tutele della legge del tuo paese di residenza e puoi rivolgerti al giudice del luogo in cui risiedi.",
      "Queste condizioni esistono in italiano, francese, inglese, tedesco e spagnolo. Tutte le versioni hanno lo stesso valore."]),
  ],
  'form_titre': 'Modulo di recesso',
  'form': "Da inviare a {nom}, {adresse}, Italia, <a href=\"mailto:{email}\">{email}</a>:<br>« Con la presente comunico il mio recesso dal contratto di abbonamento CallIt! Pro. Sottoscritto il: … · Nome: … · Indirizzo e-mail dell'account: … · Data: … »",
  'retour': 'Torna a CallIt!',
},
'en': {
  'titre': 'CallIt! Pro terms of sale',
  'desc': 'Terms of sale for the CallIt! Pro subscription: price, payment, cancellation, right of withdrawal.',
  'maj': 'Updated: {maj}.',
  'brouillon': 'Draft: these terms are not in force yet, the subscription is not open yet.',
  'bref': "<b>In short:</b> CallIt! stays free. With an account you get {gratuit} free condition checks a week. CallIt! Pro, at €{prix} a month including VAT, makes them unlimited. No commitment: cancel whenever you like, in two clicks.",
  'sections': [
    ('Who sells', [
      "CallIt! is published and sold by {nom}, a sole proprietorship (ditta individuale) registered in Italy, VAT number (partita IVA) IT{piva}, registered office: {adresse}, Italy.",
      'Contact: <a href="mailto:{email}">{email}</a>. We answer in English, French and Italian.']),
    ('What you buy', [
      "CallIt! Pro is a subscription that gives unlimited access to card condition checks: centering, visible defects, estimated grade and a picture to share.",
      "Without Pro, each account gets {gratuit} free checks a week (the counter resets every Monday). Everything else in CallIt! (prices, collection, wishlist, scan…) stays free.",
      "You need a (free) CallIt! account to subscribe. Pro is tied to that account and works on all your signed-in devices."]),
    ('Price', [
      "€{prix} a month, VAT included. The exact price is shown on the payment page before you confirm. There are no other fees.",
      "If the price ever changes, we tell you by email at least 30 days before. You can cancel before the new price applies."]),
    ('Payment', [
      "Payment goes through Stripe, a licensed payment provider. You enter your card (or another method offered) at Stripe: CallIt! never sees or keeps your bank details.",
      "The first month is paid when you subscribe, then every month on the same date until you cancel. You get a receipt by email for each payment.",
      "If a payment fails, Stripe retries for a few days. Without payment, your account simply goes back to the free version."]),
    ('Duration and cancellation', [
      "The subscription has no commitment. You can cancel at any time with the « Manage my subscription » button in the app, or by writing to us.",
      "Cancellation takes effect at the end of the month already paid: you keep Pro until then, and nothing more is charged. The current month is not refunded, except on withdrawal (below)."]),
    ('Right of withdrawal (14 days)', [
      "You have 14 days from subscribing to withdraw, without giving a reason.",
      "At checkout you ask for Pro to start right away (checkbox). If you withdraw within those 14 days, we refund the days left: you only pay for the days Pro was already running (for example, after 10 days out of 30, you get back about €3.30).",
      "To withdraw: write a clear sentence to <a href=\"mailto:{email}\">{email}</a> (for example: « I withdraw from my CallIt! Pro subscription », with your account's email address), or use the form below. We refund you within 14 days, with the same payment method, at no cost."]),
    ('What a check is worth', [
      "A check is an automatic estimate made from your photos and depends on their quality (light, sharpness, framing). It is not an official grade: PSA, BGS, CGC and other grading companies are independent from CallIt! and set their grades on their own.",
      "CallIt! therefore guarantees neither a grade nor a resale price. Use your own judgement before sending a card for grading or buying it."]),
    ('Guarantees and liability', [
      "You benefit from the legal guarantee of conformity for digital content and services under the law of your country: if Pro does not work as described, write to us and we fix it or refund you.",
      "If Pro is unavailable for several days in a row because of us, we extend your subscription by the same time.",
      "Beyond these legal guarantees, which nothing here limits, CallIt! is not liable for buying, selling or grading decisions made from a check."]),
    ('Personal data', [
      'For the subscription we only keep its status and the Stripe identifiers linked to your account. Details: <a href="/confidentialite.html">privacy policy</a>.']),
    ('Changes to these terms', [
      "If these terms change, we tell you by email at least 30 days before. If you disagree, you can cancel before the change date."]),
    ('Disputes and governing law', [
      "If something goes wrong, write to us first: we always look for a friendly solution.",
      "These terms are governed by Italian law. If you are a consumer, you keep all the protections of the law of your country of residence and may go to the courts where you live.",
      "These terms exist in English, French, Italian, German and Spanish. All versions have the same value."]),
  ],
  'form_titre': 'Withdrawal form',
  'form': "To send to {nom}, {adresse}, Italy, <a href=\"mailto:{email}\">{email}</a>:<br>« I hereby give notice that I withdraw from my CallIt! Pro subscription contract. Subscribed on: … · Name: … · Account email address: … · Date: … »",
  'retour': 'Back to CallIt!',
},
'de': {
  'titre': 'Verkaufsbedingungen für CallIt! Pro',
  'desc': 'Verkaufsbedingungen für das Abo CallIt! Pro: Preis, Zahlung, Kündigung, Widerruf.',
  'maj': 'Stand: {maj}.',
  'brouillon': 'Entwurf: Diese Bedingungen gelten noch nicht, das Abo ist noch nicht verfügbar.',
  'bref': "<b>Kurz gesagt:</b> CallIt! bleibt kostenlos. Mit einem Konto hast du {gratuit} kostenlose Zustandsanalysen pro Woche. CallIt! Pro für {prix} € im Monat inkl. MwSt. macht sie unbegrenzt. Ohne Bindung: Du kündigst jederzeit mit zwei Klicks.",
  'sections': [
    ('Verkäufer', [
      "CallIt! wird herausgegeben und verkauft von {nom}, Einzelunternehmen (ditta individuale) mit Sitz in Italien, USt-IdNr. (partita IVA) IT{piva}, Sitz: {adresse}, Italien.",
      'Kontakt: <a href="mailto:{email}">{email}</a>. Wir antworten auf Englisch, Französisch und Italienisch.']),
    ('Was du kaufst', [
      "CallIt! Pro ist ein Abo mit unbegrenztem Zugang zu Zustandsanalysen einer Karte: Zentrierung, sichtbare Mängel, geschätzte Note und ein Bild zum Teilen.",
      "Ohne Pro hat jedes Konto {gratuit} kostenlose Analysen pro Woche (der Zähler beginnt jeden Montag neu). Alles andere in CallIt! (Preise, Sammlung, Wunschliste, Scan…) bleibt kostenlos.",
      "Für das Abo brauchst du ein (kostenloses) CallIt!-Konto. Pro gehört zu diesem Konto und funktioniert auf allen deinen angemeldeten Geräten."]),
    ('Preis', [
      "{prix} € im Monat, inklusive Mehrwertsteuer. Der genaue Preis steht auf der Zahlungsseite, bevor du bestätigst. Es gibt keine weiteren Kosten.",
      "Ändert sich der Preis einmal, sagen wir es dir mindestens 30 Tage vorher per E-Mail. Du kannst kündigen, bevor der neue Preis gilt."]),
    ('Zahlung', [
      "Die Zahlung läuft über Stripe, einen zugelassenen Zahlungsdienstleister. Du gibst deine Karte (oder ein anderes angebotenes Zahlungsmittel) bei Stripe ein: CallIt! sieht und speichert deine Bankdaten nie.",
      "Der erste Monat wird beim Abschluss bezahlt, danach jeden Monat am selben Tag bis zur Kündigung. Für jede Zahlung bekommst du eine Quittung per E-Mail.",
      "Schlägt eine Zahlung fehl, versucht Stripe es einige Tage lang erneut. Ohne Zahlung wird dein Konto einfach wieder zur kostenlosen Version."]),
    ('Laufzeit und Kündigung', [
      "Das Abo hat keine Mindestlaufzeit. Du kannst es jederzeit mit der Schaltfläche « Mein Abo verwalten » in der App oder per E-Mail an uns kündigen.",
      "Die Kündigung wirkt zum Ende des bereits bezahlten Monats: Bis dahin behältst du Pro, danach wird nichts mehr abgebucht. Der laufende Monat wird nicht erstattet, außer beim Widerruf (siehe unten)."]),
    ('Widerrufsrecht (14 Tage)', [
      "Du kannst innerhalb von 14 Tagen ab Abschluss ohne Angabe von Gründen widerrufen.",
      "Bei der Zahlung verlangst du, dass Pro sofort beginnt (Kästchen zum Ankreuzen). Widerrufst du innerhalb dieser 14 Tage, erstatten wir dir die restlichen Tage: Du zahlst nur die Tage, an denen Pro schon lief (zum Beispiel nach 10 von 30 Tagen bekommst du etwa 3,30 € zurück).",
      "So widerrufst du: Schreib an <a href=\"mailto:{email}\">{email}</a> einen klaren Satz (zum Beispiel: « Ich widerrufe mein Abo CallIt! Pro », mit der E-Mail-Adresse deines Kontos) oder nutze das Formular unten. Wir erstatten innerhalb von 14 Tagen über dasselbe Zahlungsmittel, ohne Kosten."]),
    ('Was eine Analyse aussagt', [
      "Eine Analyse ist eine automatische Schätzung anhand deiner Fotos und hängt von deren Qualität ab (Licht, Schärfe, Ausschnitt). Sie ist keine offizielle Note: PSA, BGS, CGC und andere Grading-Firmen sind von CallIt! unabhängig und vergeben ihre Noten selbst.",
      "CallIt! garantiert daher weder eine Note noch einen Wiederverkaufspreis. Bleib kritisch, bevor du eine Karte zum Grading schickst oder kaufst."]),
    ('Gewährleistung und Haftung', [
      "Dir steht die gesetzliche Gewährleistung für digitale Inhalte und Dienstleistungen nach dem Recht deines Landes zu: Funktioniert Pro nicht wie beschrieben, schreib uns, dann beheben wir es oder erstatten dir den Betrag.",
      "Ist Pro durch unser Verschulden mehrere Tage am Stück nicht verfügbar, verlängern wir dein Abo um diese Zeit.",
      "Außerhalb dieser gesetzlichen Rechte, die hier nicht eingeschränkt werden, haftet CallIt! nicht für Kauf-, Verkaufs- oder Grading-Entscheidungen auf Grundlage einer Analyse."]),
    ('Personenbezogene Daten', [
      'Für das Abo speichern wir nur seinen Status und die mit deinem Konto verbundenen Stripe-Kennungen. Details: <a href="/confidentialite.html">Datenschutzerklärung</a>.']),
    ('Änderungen dieser Bedingungen', [
      "Ändern sich diese Bedingungen, sagen wir es dir mindestens 30 Tage vorher per E-Mail. Bist du nicht einverstanden, kannst du vor dem Änderungsdatum kündigen."]),
    ('Streitigkeiten und anwendbares Recht', [
      "Bei einem Problem schreib uns zuerst: Wir suchen immer eine gütliche Lösung.",
      "Diese Bedingungen unterliegen italienischem Recht. Als Verbraucher behältst du alle Schutzrechte deines Wohnsitzlandes und kannst das Gericht an deinem Wohnort anrufen.",
      "Diese Bedingungen gibt es auf Deutsch, Französisch, Italienisch, Englisch und Spanisch. Alle Fassungen sind gleichwertig."]),
  ],
  'form_titre': 'Widerrufsformular',
  'form': "Zu senden an {nom}, {adresse}, Italien, <a href=\"mailto:{email}\">{email}</a>:<br>« Hiermit widerrufe ich meinen Abo-Vertrag CallIt! Pro. Abgeschlossen am: … · Name: … · E-Mail-Adresse des Kontos: … · Datum: … »",
  'retour': 'Zurück zu CallIt!',
},
'es': {
  'titre': 'Condiciones de venta de CallIt! Pro',
  'desc': 'Condiciones de venta de la suscripción CallIt! Pro: precio, pago, cancelación, desistimiento.',
  'maj': 'Actualización: {maj}.',
  'brouillon': 'Borrador: estas condiciones aún no están en vigor, la suscripción aún no está abierta.',
  'bref': "<b>En resumen:</b> CallIt! sigue siendo gratis. Con una cuenta tienes {gratuit} análisis de estado gratis por semana. CallIt! Pro, a {prix} € al mes con IVA incluido, los hace ilimitados. Sin permanencia: cancelas cuando quieras, en dos clics.",
  'sections': [
    ('Quién vende', [
      "CallIt! lo publica y lo vende {nom}, empresa individual (ditta individuale) registrada en Italia, NIF-IVA (partita IVA) IT{piva}, domicilio: {adresse}, Italia.",
      'Contacto: <a href="mailto:{email}">{email}</a>. Respondemos en inglés, francés e italiano.']),
    ('Qué compras', [
      "CallIt! Pro es una suscripción que da acceso ilimitado a los análisis de estado de una carta: centrado, defectos visibles, nota estimada e imagen para compartir.",
      "Sin Pro, cada cuenta tiene {gratuit} análisis gratis por semana (el contador vuelve a empezar cada lunes). Todo lo demás de CallIt! (precios, colección, lista de deseos, escaneo…) sigue siendo gratis.",
      "Para suscribirte necesitas una cuenta de CallIt! (gratis). Pro va unido a esa cuenta y funciona en todos tus dispositivos conectados."]),
    ('Precio', [
      "{prix} € al mes, IVA incluido. El precio exacto aparece en la página de pago antes de que confirmes. No hay otros gastos.",
      "Si algún día cambia el precio, te avisamos por correo al menos 30 días antes. Puedes cancelar antes de que se aplique el nuevo precio."]),
    ('Pago', [
      "El pago pasa por Stripe, un proveedor de pagos autorizado. Introduces tu tarjeta (u otro medio ofrecido) en Stripe: CallIt! nunca ve ni guarda tus datos bancarios.",
      "El primer mes se paga al suscribirte y después cada mes en la misma fecha, hasta que canceles. Recibes un recibo por correo con cada pago.",
      "Si un pago falla, Stripe lo reintenta durante unos días. Sin pago, tu cuenta vuelve simplemente a la versión gratuita."]),
    ('Duración y cancelación', [
      "La suscripción no tiene permanencia. Puedes cancelarla en cualquier momento con el botón « Gestionar mi suscripción » de la app, o escribiéndonos.",
      "La cancelación surte efecto al final del mes ya pagado: conservas Pro hasta entonces y después no se cobra nada más. El mes en curso no se reembolsa, salvo en caso de desistimiento (abajo)."]),
    ('Derecho de desistimiento (14 días)', [
      "Tienes 14 días desde la suscripción para desistir, sin dar ninguna razón.",
      "Al pagar, pides que Pro empiece de inmediato (casilla para marcar). Si desistes en esos 14 días, te reembolsamos los días que quedan: solo pagas los días en que Pro ya ha funcionado (por ejemplo, tras 10 días de 30, te devolvemos unos 3,30 €).",
      "Para desistir: escribe a <a href=\"mailto:{email}\">{email}</a> una frase clara (por ejemplo: « Desisto de mi suscripción CallIt! Pro », con el correo de tu cuenta), o usa el formulario de abajo. Te reembolsamos en 14 días, con el mismo medio de pago, sin gastos."]),
    ('Qué vale un análisis', [
      "Un análisis es una estimación automática hecha a partir de tus fotos y depende de su calidad (luz, nitidez, encuadre). No es una nota oficial: PSA, BGS, CGC y las demás empresas de gradación son independientes de CallIt! y deciden solas sus notas.",
      "Por lo tanto, CallIt! no garantiza ni una nota ni un precio de reventa. Usa tu propio criterio antes de enviar una carta a gradar o de comprarla."]),
    ('Garantías y responsabilidad', [
      "Tienes la garantía legal de conformidad de los contenidos y servicios digitales que prevé la ley de tu país: si Pro no funciona como se describe, escríbenos y lo arreglamos o te reembolsamos.",
      "Si Pro no está disponible varios días seguidos por nuestra causa, alargamos tu suscripción ese mismo tiempo.",
      "Fuera de estas garantías legales, que nada aquí limita, CallIt! no es responsable de las decisiones de compra, venta o gradación tomadas a partir de un análisis."]),
    ('Datos personales', [
      'Para la suscripción solo guardamos su estado y los identificadores de Stripe vinculados a tu cuenta. Detalles: <a href="/confidentialite.html">política de privacidad</a>.']),
    ('Cambios en estas condiciones', [
      "Si estas condiciones cambian, te avisamos por correo al menos 30 días antes. Si no estás de acuerdo, puedes cancelar antes de la fecha del cambio."]),
    ('Conflictos y ley aplicable', [
      "Si hay un problema, escríbenos primero: siempre buscamos una solución amistosa.",
      "Estas condiciones se rigen por la ley italiana. Si eres consumidor, conservas todas las protecciones de la ley de tu país de residencia y puedes acudir a los tribunales de tu lugar de residencia.",
      "Estas condiciones existen en español, francés, italiano, inglés y alemán. Todas las versiones tienen el mismo valor."]),
  ],
  'form_titre': 'Formulario de desistimiento',
  'form': "Para enviar a {nom}, {adresse}, Italia, <a href=\"mailto:{email}\">{email}</a>:<br>« Por la presente le comunico que desisto de mi contrato de suscripción CallIt! Pro. Suscrito el: … · Nombre: … · Correo de la cuenta: … · Fecha: … »",
  'retour': 'Volver a CallIt!',
},
}

STYLE = """  :root { --bg: #ebebe8; --surface: #ffffff; --ink: #16161a; --muted: #5c5c56; --line: #d6d6d1; --gain: #0a7a44; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg: #18181b; --surface: #232327; --ink: #ececea; --muted: #a3a39b; --line: #303035; --gain: #4cc98a; color-scheme: dark; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
  .carte { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px 20px 8px; }
  .alerte { border-color: #c9a227; }
  h1 { font-size: 28px; line-height: 1.2; margin: 0 0 6px; }
  h2 { font-size: 18px; margin: 28px 0 6px; }
  p, li { margin: 0 0 10px; }
  .muted { color: var(--muted); font-size: 14px; }
  .langues { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0 0 18px; font-size: 14px; }
  a { color: var(--gain); }
  hr { border: 0; border-top: 1px solid var(--line); margin: 40px 0 24px; }"""


def page(l):
    t = TEXTES[l]
    v = dict(VENDEUR, maj=MAJ[l])
    # Les valeurs viennent de ce fichier (pas d'un utilisateur) ; on échappe quand même les données du vendeur
    v = {k: html.escape(x) for k, x in v.items()}
    f = lambda s: s.format(**v)
    langues = ' '.join(
        f'<b>{NOMS[x]}</b>' if x == l else f'<a href="{x}.html" hreflang="{x}" lang="{x}">{NOMS[x]}</a>' for x in TEXTES)
    alt = '\n'.join(f'<link rel="alternate" hreflang="{x}" href="https://callitcards.com/conditions/{x}.html">' for x in TEXTES)
    corps = [f'<h1>{t["titre"]}</h1>', f'<nav class="langues" aria-label="Langues">{langues}</nav>',
             f'<p class="muted">{f(t["maj"])}</p>']
    if BROUILLON:
        corps.append(f'<div class="carte alerte"><p><b>{t["brouillon"]}</b></p></div><p></p>')
    corps.append(f'<div class="carte"><p>{f(t["bref"])}</p></div>')
    for titre, ps in t['sections']:
        corps.append(f'<h2>{titre}</h2>')
        corps += [f'<p>{f(p)}</p>' for p in ps]
    corps.append(f'<h2>{t["form_titre"]}</h2><div class="carte"><p>{f(t["form"])}</p></div>')
    corps.append(f'<hr><p class="muted"><a href="/">{t["retour"]}</a> · CallIt! · P.IVA {v["piva"]}</p>')
    robots = '<meta name="robots" content="noindex">\n' if BROUILLON else ''
    return f"""<!doctype html>
<html lang="{l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t['titre']} · CallIt!</title>
<meta name="description" content="{html.escape(t['desc'])}">
{robots}<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
{alt}
<style>
{STYLE}
</style>
</head>
<body>
<main>
{chr(10).join(corps)}
</main>
</body>
</html>
"""


INDEX = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conditions de vente · CallIt!</title>
<meta name="robots" content="noindex">
<script src="choix.js"></script>
</head>
<body>
<p><a href="fr.html">Français</a> · <a href="it.html">Italiano</a> · <a href="en.html">English</a> · <a href="de.html">Deutsch</a> · <a href="es.html">Español</a></p>
</body>
</html>
"""
# Script à part (la politique de sécurité du site interdit les scripts écrits dans la page)
CHOIX = """// Envoie vers les conditions de vente dans la langue du navigateur (français par défaut)
(function () {
  var l = (navigator.language || 'fr').slice(0, 2).toLowerCase();
  if (['fr', 'it', 'en', 'de', 'es'].indexOf(l) < 0) l = 'fr';
  location.replace(l + '.html');
})();
"""

if __name__ == '__main__':
    os.makedirs(SORTIE, exist_ok=True)
    for l in TEXTES:
        with open(os.path.join(SORTIE, f'{l}.html'), 'w', encoding='utf-8') as fh:
            fh.write(page(l))
    with open(os.path.join(SORTIE, 'index.html'), 'w', encoding='utf-8') as fh:
        fh.write(INDEX)
    with open(os.path.join(SORTIE, 'choix.js'), 'w', encoding='utf-8') as fh:
        fh.write(CHOIX)
    print('conditions/ :', ', '.join(f'{l}.html' for l in TEXTES), '+ index.html')
