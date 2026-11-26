"""Écrit i18n/textes-live.tsv : tous les textes du Mode Live (live.js) en en, de, es, it.
Usage : python3 outils/textes_live.py && python3 outils/i18n_build.py
(Tableau tenu ici, en Python, pour éviter les erreurs de tabulation à la main.)"""
import json

ROWS = [
    # En-tête et recherche
    ("Quitter le mode Live", "Leave Live mode", "Live-Modus verlassen", "Salir del modo Live", "Esci dalla modalità Live"),
    ("Une petite fenêtre qui reste au-dessus du live", "A small window that stays on top of the live", "Ein kleines Fenster, das über dem Live bleibt", "Una pequeña ventana que se queda encima del directo", "Una piccola finestra che resta sopra la live"),
    ("Fenêtre flottante", "Floating window", "Schwebendes Fenster", "Ventana flotante", "Finestra mobile"),
    ("Choisir les blocs affichés", "Choose the blocks shown", "Angezeigte Blöcke wählen", "Elegir los bloques mostrados", "Scegli i blocchi mostrati"),
    ("Personnaliser", "Customise", "Anpassen", "Personalizar", "Personalizza"),
    ("Type de produit", "Product type", "Produkttyp", "Tipo de producto", "Tipo di prodotto"),
    ("Set et produit (ex. 151 display, ETB Évolutions Prismatiques)", "Set and product (e.g. 151 booster box, ETB Prismatic Evolutions)", "Set und Produkt (z. B. 151 Display, ETB Prismatische Entwicklungen)", "Set y producto (p. ej. 151 display, ETB Evoluciones Prismáticas)", "Set e prodotto (es. 151 display, ETB Evoluzioni Prismatiche)"),
    ("Nom ou numéro (ex. Dracaufeu 4/102)", "Name or number (e.g. Charizard 4/102)", "Name oder Nummer (z. B. Glurak 4/102)", "Nombre o número (p. ej. Charizard 4/102)", "Nome o numero (es. Charizard 4/102)"),
    ("Chercher ce qui est montré dans le live", "Search for what is shown in the live", "Suchen, was im Live gezeigt wird", "Buscar lo que se muestra en el directo", "Cerca ciò che viene mostrato nella live"),
    # Lecture de l'écran, photo, capture
    ("Raccourci : touche Espace", "Shortcut: Space key", "Kurzbefehl: Leertaste", "Atajo: tecla Espacio", "Scorciatoia: tasto Spazio"),
    ("Lire l'écran", "Read the screen", "Bildschirm lesen", "Leer la pantalla", "Leggi lo schermo"),
    ("Lire l’écran", "Read the screen", "Bildschirm lesen", "Leer la pantalla", "Leggi lo schermo"),
    ("Changer la zone", "Change the area", "Bereich ändern", "Cambiar la zona", "Cambia la zona"),
    ("Choisir la zone", "Choose the area", "Bereich wählen", "Elegir la zona", "Scegli la zona"),
    ("Arrêter", "Stop", "Beenden", "Detener", "Interrompi"),
    ("Tu choisis l'onglet du live ; rien n'est lu tant que tu ne cliques pas", "You choose the live tab; nothing is read until you click", "Du wählst den Tab des Lives; nichts wird gelesen, bevor du klickst", "Eliges la pestaña del directo; no se lee nada hasta que haces clic", "Scegli la scheda della live; non viene letto nulla finché non clicchi"),
    ("Connecter l'écran du live", "Connect the live screen", "Live-Bildschirm verbinden", "Conectar la pantalla del directo", "Collega lo schermo della live"),
    ("Photo", "Photo", "Foto", "Foto", "Foto"),
    ("Capture d'écran", "Screenshot", "Screenshot", "Captura de pantalla", "Screenshot"),
    ("Lecture de la carte…", "Reading the card…", "Karte wird gelesen…", "Leyendo la carta…", "Lettura della carta…"),
    ("Produit reconnu.", "Product recognised.", "Produkt erkannt.", "Producto reconocido.", "Prodotto riconosciuto."),
    ("Touche le bon produit ci-dessous.", "Tap the right product below.", "Tippe unten auf das richtige Produkt.", "Toca el producto correcto abajo.", "Tocca il prodotto giusto qui sotto."),
    ("reconnu, mais pas son numéro : touche la bonne version ci-dessous (les plus chères d’abord), ou ajoute le numéro dans la recherche.", "recognised, but not its number: tap the right version below (most expensive first), or add the number to the search.", "erkannt, aber nicht die Nummer: Tippe unten auf die richtige Version (die teuersten zuerst) oder füge die Nummer zur Suche hinzu.", "reconocida, pero no su número: toca la versión correcta abajo (las más caras primero) o añade el número a la búsqueda.", "riconosciuta, ma non il suo numero: tocca la versione giusta qui sotto (prima le più care) o aggiungi il numero alla ricerca."),
    ("Aucun produit reconnu : les logos de set sont difficiles à lire. Tape le set et le type de produit juste au-dessus.", "No product recognised: set logos are hard to read. Type the set and product type just above.", "Kein Produkt erkannt: Set-Logos sind schwer zu lesen. Gib Set und Produkttyp direkt darüber ein.", "Ningún producto reconocido: los logos de los sets son difíciles de leer. Escribe el set y el tipo de producto justo arriba.", "Nessun prodotto riconosciuto: i loghi dei set sono difficili da leggere. Scrivi il set e il tipo di prodotto qui sopra."),
    ("Aucune carte reconnue. Tape le nom juste au-dessus (le curseur y est déjà), ou resserre la zone autour de la carte.", "No card recognised. Type the name just above (the cursor is already there), or tighten the area around the card.", "Keine Karte erkannt. Gib den Namen direkt darüber ein (der Cursor steht schon dort) oder zieh den Bereich enger um die Karte.", "Ninguna carta reconocida. Escribe el nombre justo arriba (el cursor ya está ahí) o ajusta la zona alrededor de la carta.", "Nessuna carta riconosciuta. Scrivi il nome qui sopra (il cursore è già lì) o stringi la zona intorno alla carta."),
    ("Aucune carte reconnue. Tape le nom juste au-dessus (le curseur y est déjà), ou reprends la photo avec le numéro bien lisible.", "No card recognised. Type the name just above (the cursor is already there), or retake the photo with the number clearly readable.", "Keine Karte erkannt. Gib den Namen direkt darüber ein (der Cursor steht schon dort) oder mach das Foto noch einmal, mit gut lesbarer Nummer.", "Ninguna carta reconocida. Escribe el nombre justo arriba (el cursor ya está ahí) o repite la foto con el número bien legible.", "Nessuna carta riconosciuta. Scrivi il nome qui sopra (il cursore è già lì) o rifai la foto con il numero ben leggibile."),
    ("Astuce : « Choisir la zone » une fois, autour de l’endroit où le vendeur montre la carte. Ensuite, un clic suffit.", "Tip: use “Choose the area” once, around where the seller shows the card. After that, one click is enough.", "Tipp: Einmal „Bereich wählen“ um die Stelle, an der der Verkäufer die Karte zeigt. Danach genügt ein Klick.", "Consejo: usa «Elegir la zona» una vez, alrededor del sitio donde el vendedor muestra la carta. Después, basta un clic.", "Consiglio: usa «Scegli la zona» una volta, intorno al punto in cui il venditore mostra la carta. Poi basta un clic."),
    ("Live sur le même téléphone :", "Live on the same phone:", "Live auf demselben Handy:", "Directo en el mismo móvil:", "Live sullo stesso telefono:"),
    ("dans l’appli eBay, fais une capture d’écran quand la carte est montrée, puis touche « Partager » →", "in the eBay app, take a screenshot when the card is shown, then tap “Share” →", "mach in der eBay-App einen Screenshot, wenn die Karte gezeigt wird, und tippe dann auf „Teilen“ →", "en la app de eBay, haz una captura de pantalla cuando se muestre la carta y toca «Compartir» →", "nell'app eBay, fai uno screenshot quando viene mostrata la carta, poi tocca «Condividi» →"),
    (". Tu reviens ici et la carte est lue tout de suite. (Pour voir un live sur un autre écran, utilise « Photo ».)", ". Come back here and the card is read straight away. (To watch a live on another screen, use “Photo”.)", ". Komm hierher zurück und die Karte wird sofort gelesen. (Für ein Live auf einem anderen Bildschirm nimm „Foto“.)", ". Vuelve aquí y la carta se lee al momento. (Para ver un directo en otra pantalla, usa «Foto».)", ". Torna qui e la carta viene letta subito. (Per guardare una live su un altro schermo, usa «Foto».)"),
    ("Partage l’onglet du live une fois. CallIt! ne lit l’écran que quand tu cliques sur « Lire l’écran ».", "Share the live tab once. CallIt! only reads the screen when you click “Read the screen”.", "Teile den Tab des Lives einmal. CallIt! liest den Bildschirm nur, wenn du auf „Bildschirm lesen“ klickst.", "Comparte la pestaña del directo una vez. CallIt! solo lee la pantalla cuando haces clic en «Leer la pantalla».", "Condividi la scheda della live una volta. CallIt! legge lo schermo solo quando clicchi su «Leggi lo schermo»."),
    ("Lot lu par l’IA : vérifie chaque carte ci-dessous.", "Lot read by AI: check each card below.", "Von der KI gelesenes Lot: Prüfe jede Karte unten.", "Lote leído por la IA: revisa cada carta abajo.", "Lotto letto dall'IA: controlla ogni carta qui sotto."),
    ("Trouvé avec l’IA.", "Found with AI.", "Mit KI gefunden.", "Encontrado con la IA.", "Trovato con l'IA."),
    ("L’IA regarde l’image…", "AI is looking at the image…", "Die KI sieht sich das Bild an…", "La IA está mirando la imagen…", "L'IA sta guardando l'immagine…"),
    ("Zone lue", "Area read", "Gelesener Bereich", "Zona leída", "Zona letta"),
    # Résultats
    ("Aucune carte trouvée pour « {0} ».", "No card found for “{0}”.", "Keine Karte gefunden für „{0}“.", "No se ha encontrado ninguna carta para «{0}».", "Nessuna carta trovata per «{0}»."),
    ("Pas celle-ci ?", "Not this one?", "Nicht diese?", "¿No es esta?", "Non è questa?"),
    ("Vues récemment", "Recently viewed", "Zuletzt angesehen", "Vistas recientemente", "Viste di recente"),
    ("Tape le nom de la carte, prends-la en photo ou lis l’écran du live pour voir sa cote.", "Type the card name, take a photo of it or read the live screen to see its price.", "Gib den Namen der Karte ein, fotografiere sie oder lies den Live-Bildschirm, um ihren Preis zu sehen.", "Escribe el nombre de la carta, hazle una foto o lee la pantalla del directo para ver su precio.", "Scrivi il nome della carta, fotografala o leggi lo schermo della live per vedere la sua quotazione."),
    # Lives eBay
    ("Lives eBay de tous les pays", "eBay lives from every country", "eBay-Lives aus allen Ländern", "Directos de eBay de todos los países", "Live eBay di tutti i paesi"),
    ("Chaque pays a ses propres lives : regarde aussi ailleurs, les prix et la livraison changent.", "Each country has its own lives: look elsewhere too, prices and shipping vary.", "Jedes Land hat eigene Lives: Schau auch woanders, Preise und Versand sind unterschiedlich.", "Cada país tiene sus propios directos: mira también en otros, los precios y el envío cambian.", "Ogni paese ha le sue live: guarda anche altrove, prezzi e spedizione cambiano."),
    ("Liens partenaires : CallIt! touche une petite commission d’eBay si tu achètes, sans frais pour toi.", "Partner links: CallIt! earns a small commission from eBay if you buy, at no cost to you.", "Partnerlinks: CallIt! erhält eine kleine Provision von eBay, wenn du kaufst, ohne Kosten für dich.", "Enlaces de socio: CallIt! recibe una pequeña comisión de eBay si compras, sin coste para ti.", "Link partner: CallIt! riceve una piccola commissione da eBay se acquisti, senza costi per te."),
    ("Liens externes, sans commission.", "External links, no commission.", "Externe Links, ohne Provision.", "Enlaces externos, sin comisión.", "Link esterni, senza commissione."),
    # Bloc carte
    ("Fiche complète", "Full details", "Alle Details", "Ficha completa", "Scheda completa"),
    ("Dans mes envies ✓", "In my wishlist ✓", "Auf meiner Wunschliste ✓", "En mis deseos ✓", "Nei miei desideri ✓"),
    ("+ Mes envies", "+ My wishlist", "+ Wunschliste", "+ Mis deseos", "+ I miei desideri"),
    ("Autre carte", "Another card", "Andere Karte", "Otra carta", "Altra carta"),
    # Bloc prix
    ("Carte", "Card", "Karte", "Carta", "Carta"),
    ("Gradée", "Graded", "Gegradet", "Gradada", "Gradata"),
    ("Reverse / holo", "Reverse / holo", "Reverse / Holo", "Reverse / holo", "Reverse / holo"),
    ("6 et moins", "6 and below", "6 und weniger", "6 o menos", "6 o meno"),
    ("Pas encore de cote {0} pour cette carte.", "No {0} price for this card yet.", "Noch kein {0}-Preis für diese Karte.", "Todavía no hay precio de {0} para esta carta.", "Ancora nessuna quotazione {0} per questa carta."),
    ("Pas encore de cote {0} pour cette carte (la version la moins chère de cette carte est à {1}).", "No {0} price for this card yet (the cheapest version of this card is at {1}).", "Noch kein {0}-Preis für diese Karte (die günstigste Version dieser Karte liegt bei {1}).", "Todavía no hay precio de {0} para esta carta (la versión más barata de esta carta está a {1}).", "Ancora nessuna quotazione {0} per questa carta (la versione più economica di questa carta è a {1})."),
    ("état {0}", "{0} condition", "Zustand {0}", "estado {0}", "condizione {0}"),
    ("version {0}", "{0} version", "Version {0}", "versión {0}", "versione {0}"),
    ("Cote {0}, toutes langues", "{0} price, all languages", "{0}-Preis, alle Sprachen", "Precio de {0}, todos los idiomas", "Quotazione {0}, tutte le lingue"),
    ("Cote {0}, version reverse ou holo, toutes langues", "{0} price, reverse or holo version, all languages", "{0}-Preis, Reverse- oder Holo-Version, alle Sprachen", "Precio de {0}, versión reverse u holo, todos los idiomas", "Quotazione {0}, versione reverse o holo, tutte le lingue"),
    ("Cote {0}, {1}, toutes langues", "{0} price, {1}, all languages", "{0}-Preis, {1}, alle Sprachen", "Precio de {0}, {1}, todos los idiomas", "Quotazione {0}, {1}, tutte le lingue"),
    ("Estimation", "Estimate", "Schätzung", "Estimación", "Stima"),
    ("Estimation · {0}", "Estimate · {0}", "Schätzung · {0}", "Estimación · {0}", "Stima · {0}"),
    ("Estimation {0}", "{0} estimate", "Schätzung {0}", "Estimación {0}", "Stima {0}"),
    ("ventes des 7 et 30 derniers jours", "sales over the last 7 and 30 days", "Verkäufe der letzten 7 und 30 Tage", "ventas de los últimos 7 y 30 días", "vendite degli ultimi 7 e 30 giorni"),
    ("ventes des 7 et 30 derniers jours, version reverse ou holo", "sales over the last 7 and 30 days, reverse or holo version", "Verkäufe der letzten 7 und 30 Tage, Reverse- oder Holo-Version", "ventas de los últimos 7 y 30 días, versión reverse u holo", "vendite degli ultimi 7 e 30 giorni, versione reverse o holo"),
    ("tendance", "trend", "Trend", "tendencia", "tendenza"),
    ("tendance, version reverse ou holo", "trend, reverse or holo version", "Trend, Reverse- oder Holo-Version", "tendencia, versión reverse u holo", "tendenza, versione reverse o holo"),
    ("offre la moins chère", "cheapest offer", "günstigstes Angebot", "oferta más barata", "offerta più economica"),
    ("offre la moins chère, version reverse ou holo", "cheapest offer, reverse or holo version", "günstigstes Angebot, Reverse- oder Holo-Version", "oferta más barata, versión reverse u holo", "offerta più economica, versione reverse o holo"),
    ("tendance reverse ou holo", "reverse or holo trend", "Trend Reverse oder Holo", "tendencia reverse u holo", "tendenza reverse o holo"),
    ("moyenne 30 jours", "30-day average", "30-Tage-Durchschnitt", "media de 30 días", "media di 30 giorni"),
    ("prix bas", "low price", "Tiefstpreis", "precio bajo", "prezzo basso"),
    ("Auj.", "Today", "Heute", "Hoy", "Oggi"),
    ("hier", "yesterday", "gestern", "ayer", "ieri"),
    ("Carte à petit prix : gradée, elle vaut surtout le prix de la gradation.", "Low-priced card: graded, it is mostly worth the grading fee.", "Günstige Karte: Gegradet ist sie vor allem die Grading-Gebühr wert.", "Carta barata: gradada, vale sobre todo lo que cuesta la gradación.", "Carta economica: gradata, vale soprattutto il costo della gradazione."),
    ("D’après la cote toutes langues ({0}) : {1}.", "Based on the all-languages price ({0}): {1}.", "Laut Preis über alle Sprachen ({0}): {1}.", "Según el precio de todos los idiomas ({0}): {1}.", "In base alla quotazione di tutte le lingue ({0}): {1}."),
    ("Ventes terminées sur eBay", "Sold listings on eBay", "Verkaufte Artikel auf eBay", "Ventas finalizadas en eBay", "Vendite concluse su eBay"),
    ("ventes terminées sur eBay", "sold listings on eBay", "verkaufte Artikel auf eBay", "ventas finalizadas en eBay", "vendite concluse su eBay"),
    ("(lien externe, sans commission).", "(external link, no commission).", "(externer Link, ohne Provision).", "(enlace externo, sin comisión).", "(link esterno, senza commissione)."),
    ("{0}, toutes langues", "{0}, all languages", "{0}, alle Sprachen", "{0}, todos los idiomas", "{0}, tutte le lingue"),
    ("Prudence : les ventes des 7 derniers jours sont {0} % plus hautes que celles du mois. Hausse à confirmer.", "Careful: sales over the last 7 days are {0}% higher than over the month. The rise is not confirmed yet.", "Vorsicht: Die Verkäufe der letzten 7 Tage liegen {0} % über denen des Monats. Anstieg noch nicht bestätigt.", "Cuidado: las ventas de los últimos 7 días son un {0} % más altas que las del mes. Subida por confirmar.", "Attenzione: le vendite degli ultimi 7 giorni sono più alte del {0} % rispetto a quelle del mese. Rialzo da confermare."),
    ("Les ventes des 7 derniers jours sont {0} % plus basses que celles du mois : la cote suit la baisse.", "Sales over the last 7 days are {0}% lower than over the month: the price follows the drop.", "Die Verkäufe der letzten 7 Tage liegen {0} % unter denen des Monats: Der Preis folgt dem Rückgang.", "Las ventas de los últimos 7 días son un {0} % más bajas que las del mes: el precio sigue la bajada.", "Le vendite degli ultimi 7 giorni sono più basse del {0} % rispetto a quelle del mese: la quotazione segue il calo."),
    ("Prudence : le prix a pris {0} % sur la moyenne 30 jours. On garde la moyenne comme repère.", "Careful: the price is up {0}% on the 30-day average. The average is kept as the reference.", "Vorsicht: Der Preis liegt {0} % über dem 30-Tage-Durchschnitt. Der Durchschnitt bleibt der Richtwert.", "Cuidado: el precio ha subido un {0} % sobre la media de 30 días. Se mantiene la media como referencia.", "Attenzione: il prezzo è salito del {0} % rispetto alla media di 30 giorni. Si tiene la media come riferimento."),
    ("Le prix a baissé de {0} % par rapport à la moyenne 30 jours.", "The price has dropped {0}% compared with the 30-day average.", "Der Preis ist {0} % unter den 30-Tage-Durchschnitt gefallen.", "El precio ha bajado un {0} % respecto a la media de 30 días.", "Il prezzo è sceso del {0} % rispetto alla media di 30 giorni."),
    # Courbe
    ("Moyennes {0} sur 30 jours", "{0} averages over 30 days", "{0}-Durchschnitte über 30 Tage", "Medias de {0} en 30 días", "Medie {0} su 30 giorni"),
    ("{0} derniers jours relevés par CallIt!", "Last {0} days tracked by CallIt!", "Letzte {0} Tage, von CallIt! erfasst", "Últimos {0} días registrados por CallIt!", "Ultimi {0} giorni rilevati da CallIt!"),
    ("Courbe des prix", "Price chart", "Preisverlauf", "Curva de precios", "Andamento dei prezzi"),
    # Collection
    ("+ Ajouter", "+ Add", "+ Hinzufügen", "+ Añadir", "+ Aggiungi"),
    ("{0} exemplaire : {1}", "{0} copy: {1}", "{0} Exemplar: {1}", "{0} ejemplar: {1}", "{0} esemplare: {1}"),
    ("{0} exemplaires : {1}", "{0} copies: {1}", "{0} Exemplare: {1}", "{0} ejemplares: {1}", "{0} esemplari: {1}"),
    ("Tu ne l’as pas encore.", "You don’t have it yet.", "Du hast sie noch nicht.", "Todavía no la tienes.", "Non ce l'hai ancora."),
    ("prix max de ton envie : {0}", "max price on your wishlist: {0}", "Höchstpreis auf deiner Wunschliste: {0}", "precio máximo en tus deseos: {0}", "prezzo massimo nei tuoi desideri: {0}"),
    # Personnaliser
    ("Ce que la fenêtre affiche", "What the window shows", "Was das Fenster zeigt", "Lo que muestra la ventana", "Cosa mostra la finestra"),
    ("Monter", "Move up", "Nach oben", "Subir", "Sposta su"),
    ("Descendre", "Move down", "Nach unten", "Bajar", "Sposta giù"),
    ("Affichage serré (petite fenêtre)", "Compact view (small window)", "Kompakte Ansicht (kleines Fenster)", "Vista compacta (ventana pequeña)", "Vista compatta (finestra piccola)"),
    ("La carte", "The card", "Die Karte", "La carta", "La carta"),
    ("Le prix", "The price", "Der Preis", "El precio", "Il prezzo"),
    ("Prix du live (comparer une enchère)", "Live price (compare a bid)", "Live-Preis (Gebot vergleichen)", "Precio del directo (comparar una puja)", "Prezzo della live (confronta un'offerta)"),
    ("La petite courbe", "The small chart", "Die kleine Kurve", "La pequeña curva", "Il piccolo grafico"),
    # Prix du live et prix max
    ("Sous ton prix max", "Under your max price", "Unter deinem Höchstpreis", "Por debajo de tu precio máximo", "Sotto il tuo prezzo massimo"),
    ("Au-dessus de ton max", "Above your max", "Über deinem Höchstpreis", "Por encima de tu máximo", "Sopra il tuo massimo"),
    ("Un peu cher", "A bit expensive", "Etwas teuer", "Algo caro", "Un po' caro"),
    ("Cher", "Expensive", "Teuer", "Caro", "Caro"),
    ("{0} % de la cote", "{0}% of the price", "{0} % des Preises", "{0} % del precio", "{0} % della quotazione"),
    ("{0} % de la fourchette (milieu)", "{0}% of the range (middle)", "{0} % der Spanne (Mitte)", "{0} % de la horquilla (centro)", "{0} % della forchetta (centro)"),
    ("marge encore {0}", "{0} margin left", "noch {0} Spielraum", "margen restante {0}", "margine ancora {0}"),
    ("Mon prix max", "My max price", "Mein Höchstpreis", "Mi precio máximo", "Il mio prezzo massimo"),
    ("Pourcentage de la cote", "Percentage of the price", "Prozent des Preises", "Porcentaje del precio", "Percentuale della quotazione"),
    ("% de la cote =", "% of the price =", "% des Preises =", "% del precio =", "% della quotazione ="),
    ("Enchère ou prix du live ({0})", "Bid or live price ({0})", "Gebot oder Live-Preis ({0})", "Puja o precio del directo ({0})", "Offerta o prezzo della live ({0})"),
    ("tape le prix annoncé", "type the announced price", "angesagten Preis eingeben", "escribe el precio anunciado", "scrivi il prezzo annunciato"),
    # Suivi de l'enchère
    ("Connecte l’écran du live pour suivre l’enchère automatiquement.", "Connect the live screen to follow the bid automatically.", "Verbinde den Live-Bildschirm, um das Gebot automatisch zu verfolgen.", "Conecta la pantalla del directo para seguir la puja automáticamente.", "Collega lo schermo della live per seguire l'offerta automaticamente."),
    ("Stop le suivi", "Stop following", "Verfolgung stoppen", "Detener el seguimiento", "Ferma il monitoraggio"),
    ("Suivi en cours…", "Following…", "Wird verfolgt…", "Siguiendo…", "Monitoraggio in corso…"),
    ("Suivre l’enchère", "Follow the bid", "Gebot verfolgen", "Seguir la puja", "Segui l'offerta"),
    ("Changer la zone du prix", "Change the price area", "Preisbereich ändern", "Cambiar la zona del precio", "Cambia la zona del prezzo"),
    ("Enchère lue à {0}", "Bid read at {0}", "Gebot gelesen um {0}", "Puja leída a las {0}", "Offerta letta alle {0}"),
    ("Montant illisible à {0} : resserre la zone du prix", "Amount unreadable at {0}: tighten the price area", "Betrag um {0} unlesbar: Zieh den Preisbereich enger", "Importe ilegible a las {0}: ajusta la zona del precio", "Importo illeggibile alle {0}: stringi la zona del prezzo"),
    ("Lecture impossible pour l’instant", "Can’t read for now", "Lesen gerade nicht möglich", "No se puede leer por ahora", "Lettura impossibile per ora"),
    # Choix de la zone
    ("Trace un rectangle serré autour du montant de l’enchère (seulement le prix), puis valide.", "Draw a tight rectangle around the bid amount (just the price), then confirm.", "Zieh ein enges Rechteck um den Gebotsbetrag (nur den Preis) und bestätige.", "Dibuja un rectángulo ajustado alrededor del importe de la puja (solo el precio) y valida.", "Traccia un rettangolo stretto intorno all'importo dell'offerta (solo il prezzo), poi conferma."),
    ("Trace un rectangle autour de l’endroit où la carte apparaît, puis valide.", "Draw a rectangle around where the card appears, then confirm.", "Zieh ein Rechteck um die Stelle, an der die Karte erscheint, und bestätige.", "Dibuja un rectángulo alrededor del sitio donde aparece la carta y valida.", "Traccia un rettangolo intorno al punto in cui appare la carta, poi conferma."),
    ("Tout l’écran", "Whole screen", "Ganzer Bildschirm", "Toda la pantalla", "Tutto lo schermo"),
    # Fenêtre flottante et messages courts
    ("Le mode Live est ouvert dans la fenêtre flottante, au-dessus de tes autres fenêtres. Ferme-la pour le ramener ici.", "Live mode is open in the floating window, on top of your other windows. Close it to bring it back here.", "Der Live-Modus ist im schwebenden Fenster geöffnet, über deinen anderen Fenstern. Schließ es, um ihn hierher zurückzuholen.", "El modo Live está abierto en la ventana flotante, encima de tus otras ventanas. Ciérrala para traerlo aquí.", "La modalità Live è aperta nella finestra mobile, sopra le altre finestre. Chiudila per riportarla qui."),
    ("Accueil", "Home", "Startseite", "Inicio", "Home"),
    ("Fenêtre flottante impossible dans ce navigateur", "Floating window not available in this browser", "Schwebendes Fenster in diesem Browser nicht möglich", "Ventana flotante no disponible en este navegador", "Finestra mobile non disponibile in questo browser"),
    ("Ajout depuis la fenêtre principale", "Adding from the main window", "Hinzufügen im Hauptfenster", "Añadiendo desde la ventana principal", "Aggiunta dalla finestra principale"),
    ("Écran non disponible : reconnecte-le", "Screen not available: reconnect it", "Bildschirm nicht verfügbar: Verbinde ihn neu", "Pantalla no disponible: vuelve a conectarla", "Schermo non disponibile: ricollegalo"),
    ("Zone enregistrée", "Area saved", "Bereich gespeichert", "Zona guardada", "Zona salvata"),
    ("Image illisible", "Unreadable image", "Bild nicht lesbar", "Imagen ilegible", "Immagine illeggibile"),
    ("Écran connecté. Clique sur « Lire l’écran » quand la carte est montrée.", "Screen connected. Click “Read the screen” when the card is shown.", "Bildschirm verbunden. Klick auf „Bildschirm lesen“, wenn die Karte gezeigt wird.", "Pantalla conectada. Haz clic en «Leer la pantalla» cuando se muestre la carta.", "Schermo collegato. Clicca su «Leggi lo schermo» quando viene mostrata la carta."),
    ("La lecture n’a pas marché. Réessaie, ou tape le nom.", "Reading didn’t work. Try again, or type the name.", "Das Lesen hat nicht geklappt. Versuch es noch einmal oder gib den Namen ein.", "La lectura no ha funcionado. Vuelve a intentarlo o escribe el nombre.", "La lettura non ha funzionato. Riprova o scrivi il nome."),
    # Produits scellés
    ("version asiatique", "Asian version", "asiatische Version", "versión asiática", "versione asiatica"),
    ("Autre produit", "Another product", "Anderes Produkt", "Otro producto", "Altro prodotto"),
    ("Cote Cardmarket (tendance), produit scellé, toutes langues", "Cardmarket price (trend), sealed product, all languages", "Cardmarket-Preis (Trend), versiegeltes Produkt, alle Sprachen", "Precio de Cardmarket (tendencia), producto sellado, todos los idiomas", "Quotazione Cardmarket (tendenza), prodotto sigillato, tutte le lingue"),
    ("Pas encore de cote Cardmarket pour ce produit", "No Cardmarket price for this product yet", "Noch kein Cardmarket-Preis für dieses Produkt", "Todavía no hay precio de Cardmarket para este producto", "Ancora nessuna quotazione Cardmarket per questo prodotto"),
    ("Aucun produit trouvé pour « {0} ». Essaie le nom anglais du set ou un autre mot (booster, display, ETB, coffret, tin).", "No product found for “{0}”. Try the set’s English name or another word (booster, booster box, ETB, box, tin).", "Kein Produkt gefunden für „{0}“. Versuch den englischen Namen des Sets oder ein anderes Wort (Booster, Display, ETB, Box, Tin).", "No se ha encontrado ningún producto para «{0}». Prueba el nombre inglés del set u otra palabra (booster, display, ETB, caja, tin).", "Nessun prodotto trovato per «{0}». Prova il nome inglese del set o un'altra parola (booster, display, ETB, box, tin)."),
    ("Tape le set et le type de produit (ex. « 151 display », « ETB Évolutions Prismatiques ») ou prends la boîte en photo : la cote Cardmarket du produit s’affiche tout de suite.", "Type the set and product type (e.g. “151 booster box”, “ETB Prismatic Evolutions”) or take a photo of the box: the product’s Cardmarket price shows straight away.", "Gib Set und Produkttyp ein (z. B. „151 Display“, „ETB Prismatische Entwicklungen“) oder fotografiere die Box: Der Cardmarket-Preis des Produkts erscheint sofort.", "Escribe el set y el tipo de producto (p. ej. «151 display», «ETB Evoluciones Prismáticas») o haz una foto de la caja: el precio de Cardmarket del producto aparece al momento.", "Scrivi il set e il tipo di prodotto (es. «151 display», «ETB Evoluzioni Prismatiche») o fotografa la scatola: la quotazione Cardmarket del prodotto appare subito."),
    # Essai IA (caché)
    ("Ma clé API Anthropic (test)", "My Anthropic API key (test)", "Mein Anthropic-API-Schlüssel (Test)", "Mi clave API de Anthropic (prueba)", "La mia chiave API Anthropic (test)"),
    ("Clé API Anthropic, gardée sur cet appareil", "Anthropic API key, kept on this device", "Anthropic-API-Schlüssel, auf diesem Gerät gespeichert", "Clave API de Anthropic, guardada en este dispositivo", "Chiave API Anthropic, salvata su questo dispositivo"),
    ("Garder", "Save", "Speichern", "Guardar", "Salva"),
    ("Clé gardée sur cet appareil seulement", "Key kept on this device only", "Schlüssel nur auf diesem Gerät gespeichert", "Clave guardada solo en este dispositivo", "Chiave salvata solo su questo dispositivo"),
    ("Clé effacée de cet appareil", "Key deleted from this device", "Schlüssel von diesem Gerät gelöscht", "Clave borrada de este dispositivo", "Chiave cancellata da questo dispositivo"),
    ("✦ Essayer avec l’IA", "✦ Try with AI", "✦ Mit KI versuchen", "✦ Probar con la IA", "✦ Prova con l'IA"),
    ("✦ Lot avec l’IA", "✦ Lot with AI", "✦ Lot mit KI", "✦ Lote con la IA", "✦ Lotto con l'IA"),
    ("✦ Pré-gradation", "✦ Pre-grading", "✦ Vor-Grading", "✦ Pregradación", "✦ Pre-gradazione"),
    ("Lis une image d’abord, puis « Essayer avec l’IA ».", "Read an image first, then “Try with AI”.", "Lies zuerst ein Bild, dann „Mit KI versuchen“.", "Lee primero una imagen y luego «Probar con la IA».", "Leggi prima un'immagine, poi «Prova con l'IA»."),
    ("Effacer ma clé", "Delete my key", "Meinen Schlüssel löschen", "Borrar mi clave", "Cancella la mia chiave"),
    ("Clé refusée par Anthropic : vérifie-la, ou efface-la et recolle-la.", "Key rejected by Anthropic: check it, or delete it and paste it again.", "Schlüssel von Anthropic abgelehnt: Prüfe ihn oder lösche ihn und füge ihn neu ein.", "Clave rechazada por Anthropic: compruébala o bórrala y vuelve a pegarla.", "Chiave rifiutata da Anthropic: controllala o cancellala e incollala di nuovo."),
    ("Cette clé n’a pas accès à ce modèle.", "This key has no access to this model.", "Dieser Schlüssel hat keinen Zugriff auf dieses Modell.", "Esta clave no tiene acceso a este modelo.", "Questa chiave non ha accesso a questo modello."),
    ("Trop de demandes ou limite de dépense atteinte : réessaie dans un moment.", "Too many requests or spending limit reached: try again in a moment.", "Zu viele Anfragen oder Ausgabenlimit erreicht: Versuch es gleich noch einmal.", "Demasiadas solicitudes o límite de gasto alcanzado: vuelve a intentarlo en un momento.", "Troppe richieste o limite di spesa raggiunto: riprova tra poco."),
    ("Pas de connexion avec Anthropic.", "No connection to Anthropic.", "Keine Verbindung zu Anthropic.", "Sin conexión con Anthropic.", "Nessuna connessione con Anthropic."),
    ("L’IA n’a pas voulu analyser cette image.", "The AI declined to analyse this image.", "Die KI wollte dieses Bild nicht analysieren.", "La IA no ha querido analizar esta imagen.", "L'IA non ha voluto analizzare questa immagine."),
    ("Impossible de charger l’outil IA.", "Couldn’t load the AI tool.", "KI-Werkzeug konnte nicht geladen werden.", "No se ha podido cargar la herramienta de IA.", "Impossibile caricare lo strumento IA."),
    ("L’IA n’a pas pu lire cette image.", "The AI couldn’t read this image.", "Die KI konnte dieses Bild nicht lesen.", "La IA no ha podido leer esta imagen.", "L'IA non è riuscita a leggere questa immagine."),
    ("L’IA ne voit pas bien la carte : reprends la photo plus nette, la carte en entier.", "The AI can’t see the card well: retake a sharper photo showing the whole card.", "Die KI sieht die Karte nicht gut: Mach ein schärferes Foto mit der ganzen Karte.", "La IA no ve bien la carta: repite la foto más nítida, con la carta entera.", "L'IA non vede bene la carta: rifai la foto più nitida, con la carta intera."),
    ("Pré-gradation impossible", "Pre-grading not possible", "Vor-Grading nicht möglich", "Pregradación imposible", "Pre-gradazione impossibile"),
    ("L’image ne montre pas assez bien la carte. Demande au vendeur de la montrer de près, bien à plat, ou prends une photo nette.", "The image doesn’t show the card well enough. Ask the seller to show it up close and flat, or take a sharp photo.", "Das Bild zeigt die Karte nicht gut genug. Bitte den Verkäufer, sie aus der Nähe und flach zu zeigen, oder mach ein scharfes Foto.", "La imagen no muestra bien la carta. Pide al vendedor que la enseñe de cerca y bien plana, o haz una foto nítida.", "L'immagine non mostra abbastanza bene la carta. Chiedi al venditore di mostrarla da vicino e ben piatta, o fai una foto nitida."),
    ("Pré-gradation IA", "AI pre-grading", "KI-Vor-Grading", "Pregradación IA", "Pre-gradazione IA"),
    ("PSA {0} à {1}", "PSA {0} to {1}", "PSA {0} bis {1}", "PSA {0} a {1}", "PSA da {0} a {1}"),
    ("Estimation sur image, pas une note officielle. Fiabilité : {0}.", "Estimate from an image, not an official grade. Reliability: {0}.", "Schätzung anhand eines Bildes, keine offizielle Note. Zuverlässigkeit: {0}.", "Estimación sobre imagen, no es una nota oficial. Fiabilidad: {0}.", "Stima su immagine, non un voto ufficiale. Affidabilità: {0}."),
    ("faible", "low", "gering", "baja", "bassa"),
    ("moyenne", "medium", "mittel", "media", "media"),
    ("bonne", "good", "gut", "buena", "buona"),
    ("haut/bas", "top/bottom", "oben/unten", "arriba/abajo", "alto/basso"),
    ("Voir la cote en PSA {0}", "See the PSA {0} price", "PSA-{0}-Preis ansehen", "Ver el precio en PSA {0}", "Vedi la quotazione in PSA {0}"),
    ("Mesurer le centrage précisément", "Measure the centering precisely", "Zentrierung genau messen", "Medir el centrado con precisión", "Misura la centratura con precisione"),
    # Lot
    ("Non reconnue", "Not recognised", "Nicht erkannt", "No reconocida", "Non riconosciuta"),
    ("Toutes langues", "All languages", "Alle Sprachen", "Todos los idiomas", "Tutte le lingue"),
    ("(IA)", "(AI)", "(KI)", "(IA)", "(IA)"),
    ("Lot · {0} carte", "Lot · {0} card", "Lot · {0} Karte", "Lote · {0} carta", "Lotto · {0} carta"),
    ("Lot · {0} cartes", "Lot · {0} cards", "Lot · {0} Karten", "Lote · {0} cartas", "Lotto · {0} carte"),
    ("Fermer le lot", "Close the lot", "Lot schließen", "Cerrar el lote", "Chiudi il lotto"),
    ("Corrige une carte (version, état, langue) ou retire-la. Un état marqué « (IA) » est deviné sur la photo : vérifie-le. Pour en ajouter une, tape son nom au-dessus.", "Fix a card (version, condition, language) or remove it. A condition marked “(AI)” is guessed from the photo: check it. To add one, type its name above.", "Korrigiere eine Karte (Version, Zustand, Sprache) oder entferne sie. Ein mit „(KI)“ markierter Zustand ist anhand des Fotos geschätzt: Prüfe ihn. Um eine hinzuzufügen, gib oben ihren Namen ein.", "Corrige una carta (versión, estado, idioma) o quítala. Un estado marcado «(IA)» se ha deducido de la foto: compruébalo. Para añadir una, escribe su nombre arriba.", "Correggi una carta (versione, condizione, lingua) o rimuovila. Una condizione segnata «(IA)» è dedotta dalla foto: controllala. Per aggiungerne una, scrivi il suo nome qui sopra."),
    ("Total du lot · estimation selon l’état et la langue de chaque carte", "Lot total · estimate based on each card’s condition and language", "Gesamtwert des Lots · Schätzung nach Zustand und Sprache jeder Karte", "Total del lote · estimación según el estado y el idioma de cada carta", "Totale del lotto · stima in base alla condizione e alla lingua di ogni carta"),
    ("Total du lot ({0} carte sans cote) · estimation selon l’état et la langue de chaque carte", "Lot total ({0} card without a price) · estimate based on each card’s condition and language", "Gesamtwert des Lots ({0} Karte ohne Preis) · Schätzung nach Zustand und Sprache jeder Karte", "Total del lote ({0} carta sin precio) · estimación según el estado y el idioma de cada carta", "Totale del lotto ({0} carta senza quotazione) · stima in base alla condizione e alla lingua di ogni carta"),
    ("Total du lot ({0} cartes sans cote) · estimation selon l’état et la langue de chaque carte", "Lot total ({0} cards without a price) · estimate based on each card’s condition and language", "Gesamtwert des Lots ({0} Karten ohne Preis) · Schätzung nach Zustand und Sprache jeder Karte", "Total del lote ({0} cartas sin precio) · estimación según el estado y el idioma de cada carta", "Totale del lotto ({0} carte senza quotazione) · stima in base alla condizione e alla lingua di ogni carta"),
    # Entrée du Live sur l'accueil
    ("Mode Live", "Live mode", "Live-Modus", "Modo Live", "Modalità Live"),
    ("la cote en une seconde pendant un live", "the price in a second during a live", "der Preis in einer Sekunde während eines Lives", "el precio en un segundo durante un directo", "la quotazione in un secondo durante una live"),
    ("Mode Live : la cote en une seconde pendant un live", "Live mode: the price in a second during a live", "Live-Modus: der Preis in einer Sekunde während eines Lives", "Modo Live: el precio en un segundo durante un directo", "Modalità Live: la quotazione in un secondo durante una live"),
]

# « version anglaise », « version japonaise »… : tirées des traductions déjà faites de « image de la version … »
LANG_OF = ['anglaise', 'française', 'allemande', 'espagnole', 'italienne', 'portugaise', 'japonaise', 'coréenne', 'chinoise (trad.)', 'chinoise (simpl.)', 'thaïe', 'indonésienne']
D = {lg: json.load(open(f'i18n/{lg}.json', encoding='utf-8')) for lg in ['en', 'de', 'es', 'it']}
def ver(lg, t):
    if lg == 'en': return t.replace('image of the ', '')
    if lg == 'de':
        t = t.replace('Bild der ', '')
        w = t.split(' ', 1)
        return (w[0][:-1] if w[0].endswith('en') else w[0]) + ' ' + w[1]  # « englischen Version » → « englische Version »
    if lg == 'es': return t.replace('imagen de la ', '')
    return t.replace('immagine della ', '')
for l in LANG_OF:
    k = 'image de la version ' + l
    ROWS.append(('version ' + l,) + tuple(ver(lg, D[lg][k]) for lg in ['en', 'de', 'es', 'it']))

seen = set()
with open('i18n/textes-live.tsv', 'w', encoding='utf-8') as f:
    f.write('fr\ten\tde\tes\tit\n')
    for r in ROWS:
        assert len(r) == 5 and r[0] not in seen and not any('\t' in x for x in r), r
        seen.add(r[0])
        f.write('\t'.join(r) + '\n')
print(len(ROWS), 'lignes')
