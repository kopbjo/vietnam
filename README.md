# Reisefølge

Liten offline-webapp (PWA) for en familietur. Alt innhold ligger kryptert i `data.enc`
(AES-256-GCM, nøkkel avledet med PBKDF2-SHA256, 600 000 iterasjoner) og låses opp i
nettleseren med et passord. Repoet inneholder ingen reiseopplysninger i klartekst.
