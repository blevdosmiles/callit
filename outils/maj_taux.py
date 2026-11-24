"""Met à jour data/rates.json avec les taux de référence de la BCE (gratuits).
Lancé chaque jour par GitHub (.github/workflows/taux.yml)."""
import json, urllib.request, xml.etree.ElementTree as ET
URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
xml = urllib.request.urlopen(URL, timeout=30).read()
root = ET.fromstring(xml)
rates, date = {'EUR': 1}, None
for el in root.iter():
    if el.get('time'): date = el.get('time')
    if el.get('currency'): rates[el.get('currency')] = float(el.get('rate'))
assert len(rates) > 20 and date
json.dump({'date': date, 'approx': False, 'source': 'Banque centrale européenne (taux de référence)', 'base': 'EUR', 'rates': rates},
          open('data/rates.json', 'w'), separators=(',', ':'))
print(date, len(rates), 'devises')
