"""Écrit i18n/textes-salle3d.tsv : écran « Ma salle 3D » (bêta, #/salle, salle-3d.js) et son entrée du menu, en en, de, es, it.
La salle elle-même (salle3d/) est pour l'instant en français seulement.
Usage : python3 outils/textes_salle3d.py && python3 outils/i18n_build.py"""

ROWS = [
    # courts : le titre doit tenir dans l'en-tête d'un téléphone de 360 px, à côté de « Bêta » et du bouton
    ("Ma salle 3D", "My 3D room", "3D-Raum", "Mi sala 3D", "Stanza 3D"),
    ("Avis", "Feedback", "Feedback", "Opinión", "Parere"),
    ("Bêta", "Beta", "Beta", "Beta", "Beta"),
    ("Ton avis sur la salle 3D", "Your feedback on the 3D room", "Dein Feedback zum 3D-Raum", "Tu opinión sobre la sala 3D", "Il tuo parere sulla stanza 3D"),
    ("Elle est encore en test : dis-nous ce qui te plaît, ce qui manque ou ce qui ne marche pas.",
     "It’s still being tested: tell us what you like, what’s missing or what doesn’t work.",
     "Er wird noch getestet: Sag uns, was dir gefällt, was fehlt oder was nicht funktioniert.",
     "Todavía está en pruebas: dinos qué te gusta, qué falta o qué no funciona.",
     "È ancora in prova: dicci cosa ti piace, cosa manca o cosa non funziona."),
    ("J’adore", "Love it", "Super", "Me encanta", "La adoro"),
    ("Pas mal", "Not bad", "Nicht schlecht", "No está mal", "Non male"),
    ("Bof", "Meh", "Naja", "Regular", "Così così"),
    ("Ce qui te plaît, ce qui manque, ce qui ne marche pas…", "What you like, what’s missing, what doesn’t work…",
     "Was dir gefällt, was fehlt, was nicht funktioniert…", "Lo que te gusta, lo que falta, lo que no funciona…", "Cosa ti piace, cosa manca, cosa non funziona…"),
    ("Joindre cette image de la salle", "Attach this picture of the room", "Dieses Bild des Raums anhängen", "Adjuntar esta imagen de la sala", "Allega questa immagine della stanza"),
    ("Ne mets pas d’informations personnelles.", "Don’t include any personal information.", "Gib keine persönlichen Daten an.", "No incluyas datos personales.", "Non inserire informazioni personali."),
    ("La salle 3D arrive avec la prochaine version de l’appli. Tu peux déjà l’essayer sur callitcards.com.",
     "The 3D room is coming with the next version of the app. You can already try it on callitcards.com.",
     "Der 3D-Raum kommt mit der nächsten Version der App. Du kannst ihn schon auf callitcards.com ausprobieren.",
     "La sala 3D llega con la próxima versión de la app. Ya puedes probarla en callitcards.com.",
     "La stanza 3D arriva con la prossima versione dell’app. Puoi già provarla su callitcards.com."),
    ("Ouvrir callitcards.com", "Open callitcards.com", "callitcards.com öffnen", "Abrir callitcards.com", "Apri callitcards.com"),
    ("La salle ne s’est pas ouverte. Vérifie ta connexion, puis réessaie.",
     "The room didn’t open. Check your connection, then try again.",
     "Der Raum hat sich nicht geöffnet. Prüfe deine Verbindung und versuch es noch einmal.",
     "La sala no se ha abierto. Comprueba tu conexión y vuelve a intentarlo.",
     "La stanza non si è aperta. Controlla la connessione e riprova."),
]

with open('i18n/textes-salle3d.tsv', 'w', encoding='utf-8') as f:
    f.write('fr\ten\tde\tes\tit\n')
    for r in ROWS:
        assert len(r) == 5 and not any('\t' in x for x in r), r
        f.write('\t'.join(r) + '\n')
print(len(ROWS), 'lignes')
