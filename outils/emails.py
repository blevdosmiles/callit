"""Fabrique les modèles d'e-mails Supabase (Authentification > Emails) au style CallIt!, en 5 langues.

Un seul modèle par type d'e-mail : la langue est choisie à l'envoi grâce à .Data.lang
(métadonnée enregistrée à l'inscription par app.js ; français par défaut).
Sortie : emails/<type>.html (à coller dans Supabase), emails/<type>.sujet.txt, emails/apercu/<type>-<lg>.html.
Usage : python3 outils/emails.py
"""
import html, os

LANGS = ['fr', 'en', 'de', 'es', 'it']
GREEN = '#0a7a44'

COMMON = {
    'ignore': {
        'fr': 'Tu n’as rien demandé ? Ignore simplement cet e-mail : rien ne se passera.',
        'en': 'Didn’t ask for this? Just ignore this email: nothing will happen.',
        'de': 'Du hast nichts angefordert? Ignoriere diese E-Mail einfach: Es passiert nichts.',
        'es': '¿No has pedido nada? Ignora este correo: no pasará nada.',
        'it': 'Non hai chiesto nulla? Ignora questa e-mail: non succederà niente.'},
    'contact': {
        'fr': 'Une question ? Écris-nous à', 'en': 'A question? Write to us at', 'de': 'Eine Frage? Schreib uns an',
        'es': '¿Alguna pregunta? Escríbenos a', 'it': 'Una domanda? Scrivici a'},
    'fallback': {
        'fr': 'Le bouton ne marche pas ? Copie ce lien dans ton navigateur :', 'en': 'Button not working? Copy this link into your browser:',
        'de': 'Der Button funktioniert nicht? Kopiere diesen Link in deinen Browser:', 'es': '¿El botón no funciona? Copia este enlace en tu navegador:',
        'it': 'Il pulsante non funziona? Copia questo link nel browser:'},
    'expire': {
        'fr': 'Ce lien ne sert qu’une fois et expire dans 1 heure.', 'en': 'This link works once and expires in 1 hour.',
        'de': 'Dieser Link funktioniert nur einmal und läuft in 1 Stunde ab.', 'es': 'Este enlace sirve una sola vez y caduca en 1 hora.',
        'it': 'Questo link vale una sola volta e scade tra 1 ora.'},
}

WELCOME_LIST = {
    'fr': ['Avoir accès à la valeur de tes cartes tous les jours.', 'Avoir accès aux prix réels des cartes pendant les lives.', 'Vérifier les bordures de tes cartes pour une pré-gradation.', 'Ranger ta collection, ta liste d’envies et tes decks au même endroit.'],
    'en': ['Get the value of your cards every day.', 'Get the real prices of cards during live sales.', 'Check your cards’ borders for a pre-grading.', 'Keep your collection, wishlist and decks in one place.'],
    'de': ['jeden Tag den Wert deiner Karten sehen.', 'die echten Kartenpreise während Live-Verkäufen sehen.', 'die Ränder deiner Karten für eine Vorab-Bewertung prüfen.', 'deine Sammlung, Wunschliste und Decks an einem Ort verwalten.'],
    'es': ['Consultar el valor de tus cartas todos los días.', 'Ver los precios reales de las cartas durante los directos.', 'Revisar los bordes de tus cartas para una pregradación.', 'Guardar tu colección, tu lista de deseos y tus mazos en un solo lugar.'],
    'it': ['Avere accesso al valore delle tue carte ogni giorno.', 'Vedere i prezzi reali delle carte durante le live.', 'Controllare i bordi delle tue carte per una pre-gradazione.', 'Tenere collezione, lista dei desideri e mazzi in un unico posto.'],
}
PRIVACY = {
    'fr': 'Nous gardons seulement ton adresse e-mail et ta collection. Pas d’adresse postale, pas de téléphone, pas de carte bancaire.',
    'en': 'We only keep your email address and your collection. No postal address, no phone number, no bank card.',
    'de': 'Wir speichern nur deine E-Mail-Adresse und deine Sammlung. Keine Postanschrift, keine Telefonnummer, keine Bankkarte.',
    'es': 'Solo guardamos tu correo electrónico y tu colección. Sin dirección postal, sin teléfono, sin tarjeta bancaria.',
    'it': 'Conserviamo solo il tuo indirizzo e-mail e la tua collezione. Niente indirizzo postale, niente telefono, niente carta bancaria.',
}
CAN = {'fr': 'Avec CallIt!, tu peux :', 'en': 'With CallIt! you can:', 'de': 'Mit CallIt! kannst du:', 'es': 'Con CallIt! puedes:', 'it': 'Con CallIt! puoi:'}

# type : sujet, titre, texte, bouton (None = code), lien de secours + expiration
T = {
    'confirmation': {
        'subject': {'fr': 'Bienvenue sur CallIt!', 'en': 'Welcome to CallIt!', 'de': 'Willkommen bei CallIt!', 'es': '¡Bienvenido a CallIt!', 'it': 'Benvenuto su CallIt!'},
        'title': {'fr': 'Bienvenue !', 'en': 'Welcome!', 'de': 'Willkommen!', 'es': '¡Bienvenido!', 'it': 'Benvenuto!'},
        'text': {'fr': 'Confirme ton adresse e-mail pour activer ton compte. Ta collection sera sauvegardée en ligne.',
                 'en': 'Confirm your email address to activate your account. Your collection will be saved online.',
                 'de': 'Bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren. Deine Sammlung wird online gesichert.',
                 'es': 'Confirma tu correo electrónico para activar tu cuenta. Tu colección se guardará en línea.',
                 'it': 'Conferma il tuo indirizzo e-mail per attivare l’account. La tua collezione sarà salvata online.'},
        'button': {'fr': 'Confirmer mon adresse', 'en': 'Confirm my email', 'de': 'E-Mail bestätigen', 'es': 'Confirmar mi correo', 'it': 'Conferma il mio indirizzo'},
        'welcome': True},
    'magic_link': {
        'subject': {'fr': 'Ton lien de connexion CallIt!', 'en': 'Your CallIt! sign-in link', 'de': 'Dein CallIt! Anmeldelink', 'es': 'Tu enlace para entrar en CallIt!', 'it': 'Il tuo link di accesso a CallIt!'},
        'title': {'fr': 'Connexion', 'en': 'Sign in', 'de': 'Anmelden', 'es': 'Entrar', 'it': 'Accesso'},
        'text': {'fr': 'Clique sur le bouton pour te connecter à CallIt!, sans mot de passe.',
                 'en': 'Click the button to sign in to CallIt!, no password needed.',
                 'de': 'Klicke auf den Button, um dich ohne Passwort bei CallIt! anzumelden.',
                 'es': 'Pulsa el botón para entrar en CallIt!, sin contraseña.',
                 'it': 'Clicca sul pulsante per accedere a CallIt!, senza password.'},
        'button': {'fr': 'Me connecter', 'en': 'Sign in', 'de': 'Anmelden', 'es': 'Entrar', 'it': 'Accedi'}},
    'email_change': {
        'subject': {'fr': 'Confirme ta nouvelle adresse CallIt!', 'en': 'Confirm your new CallIt! email', 'de': 'Bestätige deine neue E-Mail für CallIt!', 'es': 'Confirma tu nuevo correo de CallIt!', 'it': 'Conferma il tuo nuovo indirizzo CallIt!'},
        'title': {'fr': 'Nouvelle adresse', 'en': 'New email address', 'de': 'Neue E-Mail-Adresse', 'es': 'Nuevo correo', 'it': 'Nuovo indirizzo'},
        'text': {'fr': 'Tu as demandé à remplacer {{ .Email }} par {{ .NewEmail }}. Confirme pour terminer.',
                 'en': 'You asked to replace {{ .Email }} with {{ .NewEmail }}. Confirm to finish.',
                 'de': 'Du möchtest {{ .Email }} durch {{ .NewEmail }} ersetzen. Bestätige, um abzuschließen.',
                 'es': 'Has pedido cambiar {{ .Email }} por {{ .NewEmail }}. Confirma para terminar.',
                 'it': 'Hai chiesto di sostituire {{ .Email }} con {{ .NewEmail }}. Conferma per completare.'},
        'button': {'fr': 'Confirmer le changement', 'en': 'Confirm the change', 'de': 'Änderung bestätigen', 'es': 'Confirmar el cambio', 'it': 'Conferma la modifica'}},
    'reauthentication': {
        'subject': {'fr': 'Ton code de vérification CallIt!', 'en': 'Your CallIt! verification code', 'de': 'Dein CallIt! Bestätigungscode', 'es': 'Tu código de verificación de CallIt!', 'it': 'Il tuo codice di verifica CallIt!'},
        'title': {'fr': 'Code de vérification', 'en': 'Verification code', 'de': 'Bestätigungscode', 'es': 'Código de verificación', 'it': 'Codice di verifica'},
        'text': {'fr': 'Pour confirmer que c’est bien toi, saisis ce code dans CallIt! :', 'en': 'To confirm it’s really you, enter this code in CallIt!:',
                 'de': 'Um zu bestätigen, dass du es bist, gib diesen Code in CallIt! ein:', 'es': 'Para confirmar que eres tú, introduce este código en CallIt!:',
                 'it': 'Per confermare che sei proprio tu, inserisci questo codice in CallIt!:'},
        'button': None},
    'recovery': {
        'subject': {'fr': 'Accès à ton compte CallIt!', 'en': 'Access to your CallIt! account', 'de': 'Zugang zu deinem CallIt! Konto', 'es': 'Acceso a tu cuenta de CallIt!', 'it': 'Accesso al tuo account CallIt!'},
        'title': {'fr': 'Retrouver ton compte', 'en': 'Get back into your account', 'de': 'Zugang wiederherstellen', 'es': 'Recuperar tu cuenta', 'it': 'Recupera il tuo account'},
        'text': {'fr': 'Clique sur le bouton pour te reconnecter à ton compte.', 'en': 'Click the button to sign back in to your account.',
                 'de': 'Klicke auf den Button, um dich wieder anzumelden.', 'es': 'Pulsa el botón para volver a entrar en tu cuenta.',
                 'it': 'Clicca sul pulsante per accedere di nuovo al tuo account.'},
        'button': {'fr': 'Me reconnecter', 'en': 'Sign back in', 'de': 'Wieder anmelden', 'es': 'Volver a entrar', 'it': 'Accedi di nuovo'}},
    'invite': {
        'subject': {'fr': 'Tu es invité sur CallIt!', 'en': 'You’re invited to CallIt!', 'de': 'Du bist zu CallIt! eingeladen', 'es': 'Te han invitado a CallIt!', 'it': 'Sei invitato su CallIt!'},
        'title': {'fr': 'Invitation', 'en': 'Invitation', 'de': 'Einladung', 'es': 'Invitación', 'it': 'Invito'},
        'text': {'fr': 'Tu es invité à créer ton compte CallIt!.', 'en': 'You’re invited to create your CallIt! account.',
                 'de': 'Du bist eingeladen, dein CallIt! Konto zu erstellen.', 'es': 'Te invitamos a crear tu cuenta de CallIt!.',
                 'it': 'Sei invitato a creare il tuo account CallIt!.'},
        'button': {'fr': 'Accepter l’invitation', 'en': 'Accept the invitation', 'de': 'Einladung annehmen', 'es': 'Aceptar la invitación', 'it': 'Accetta l’invito'},
        'welcome': True},
}

def e(s):  # échappe le HTML sans toucher aux balises de modèle {{ }}
    return html.escape(s, quote=False)

def logo(size):
    return (f'<span style="font-family:Georgia,\'Times New Roman\',serif;font-weight:700;font-size:{size}px;color:#16161a;letter-spacing:-.3px">'
            f'Call<span style="color:{GREEN}">It!</span></span>')

def brand(s):  # « CallIt! » dans un texte : « It! » en vert
    return s.replace('CallIt!', f'Call<span style="color:{GREEN}">It!</span>')

def body(kind, lg):
    t = T[kind]
    p = 'margin:0 0 16px;font-size:15px;line-height:1.5;color:#16161a'
    out = [f'<h1 style="margin:0 0 12px;font-family:Georgia,\'Times New Roman\',serif;font-weight:700;font-size:28px;line-height:1.1;color:#16161a">{e(t["title"][lg])}</h1>',
           f'<p style="{p}">{brand(e(t["text"][lg]))}</p>']
    if t['button']:
        out.append('<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px"><tr><td style="border-radius:999px;background:#16161a">'
                   f'<a href="{{{{ .ConfirmationURL }}}}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">{e(t["button"][lg])}</a></td></tr></table>')
    else:
        out.append('<div style="margin:8px 0 20px;padding:14px 0;text-align:center;font-family:Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:6px;color:#16161a;background:#ebebe8;border-radius:12px">{{ .Token }}</div>')
    if t.get('welcome'):
        out.append(f'<p style="margin:4px 0 8px;font-size:15px;font-weight:600;color:#16161a">{brand(e(CAN[lg]))}</p>')
        out.append('<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.5;color:#16161a">' + ''.join(f'<li style="margin:0 0 4px">{e(x)}</li>' for x in WELCOME_LIST[lg]) + '</ul>')
        out.append(f'<p style="margin:0 0 16px;padding:12px 14px;font-size:14px;line-height:1.45;color:#16161a;background:#eaf5ef;border-radius:12px">{e(PRIVACY[lg])}</p>')
    if t['button']:
        out.append(f'<p style="margin:0 0 6px;font-size:13px;line-height:1.45;color:#6b6b64">{e(COMMON["expire"][lg])} {e(COMMON["fallback"][lg])}</p>'
                   '<p style="margin:0 0 16px;font-size:12px;line-height:1.4;word-break:break-all"><a href="{{ .ConfirmationURL }}" style="color:#6b6b64">{{ .ConfirmationURL }}</a></p>')
    out.append(f'<p style="margin:0;font-size:13px;line-height:1.45;color:#6b6b64">{e(COMMON["ignore"][lg])}</p>')
    return '\n'.join(out)

def page(inner, lg_block):
    return f'''<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#ebebe8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ebebe8"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td style="padding:0 6px 16px">{logo(26)}</td></tr>
<tr><td style="background:#ffffff;border-radius:18px;padding:28px 26px">
{inner}
</td></tr>
<tr><td style="padding:16px 6px 0;font-size:12px;line-height:1.5;color:#8a8a82">{lg_block}</td></tr>
</table></td></tr></table></body></html>
'''

def footer(lg):
    return f'{e(COMMON["contact"][lg])} <a href="mailto:request@callitcards.com" style="color:#8a8a82">request@callitcards.com</a> · <a href="https://callitcards.com" style="color:#8a8a82">callitcards.com</a>'

def switch(parts, decl=True):
    # parts : {lg: texte}. Français par défaut quand la langue est inconnue.
    s = '{{ $l := or .Data.lang "fr" }}' if decl else ''
    first = True
    for lg in LANGS[1:]:
        s += ('{{ if' if first else '{{ else if') + f' eq $l "{lg}" }}}}' + parts[lg]
        first = False
    return s + '{{ else }}' + parts['fr'] + '{{ end }}'

os.makedirs('emails/apercu', exist_ok=True)
for kind, t in T.items():
    inner = {lg: body(kind, lg) for lg in LANGS}
    foot = {lg: footer(lg) for lg in LANGS}
    open(f'emails/{kind}.html', 'w', encoding='utf-8').write(page(switch(inner), switch(foot, False)))
    open(f'emails/{kind}.sujet.txt', 'w', encoding='utf-8').write(switch(t['subject']) + '\n')
    for lg in LANGS:
        demo = page(inner[lg], foot[lg]).replace('{{ .ConfirmationURL }}', 'https://callitcards.com/#exemple').replace('{{ .Token }}', '482 913') \
            .replace('{{ .Email }}', 'ancienne@exemple.com').replace('{{ .NewEmail }}', 'nouvelle@exemple.com')
        open(f'emails/apercu/{kind}-{lg}.html', 'w', encoding='utf-8').write(demo)
print('ok :', len(T), 'modèles')
