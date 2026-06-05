# ========================================================================
# STADIO 1: Builder
# ========================================================================
FROM apify/actor-node-playwright-chrome:24-1.60.0 AS builder

# Copia i file di configurazione per installare le dipendenze
COPY --chown=myuser:myuser package*.json ./

# Installazione di tutte le dipendenze (incluse quelle di sviluppo)
RUN npm install --include=dev --audit=false

# Copia il resto del codice sorgente
COPY --chown=myuser:myuser . ./

# Compila il progetto TypeScript/JavaScript
RUN npm run build


# ========================================================================
# STADIO 2: Immagine Finale
# ========================================================================
FROM apify/actor-node-playwright-chrome:24-1.60.0

# Copia i file delle dipendenze nello stadio pulito
COPY --chown=myuser:myuser package*.json ./

# Installa solo le dipendenze di produzione per mantenere l'immagine leggera
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && rm -rf ~/.npm

# ------------------------------------------------------------------------
# GESTIONE PERMESSI E CONFIGURAZIONE PATCHRIGHT
# ------------------------------------------------------------------------
# 1. Passiamo a root solo per configurare la cartella di destinazione
USER root

# 2. Creiamo la directory e assegniamo la proprietà a myuser
RUN mkdir -p /home/myuser/pw-browsers \
    && chown -R myuser:myuser /home/myuser/pw-browsers

# 3. Ritorniamo immediatamente all'utente non privilegiato di Apify
USER myuser

# 4. Configura la variabile d'ambiente per forzare il percorso di Patchright
ENV PATCHRIGHT_BROWSERS_PATH=/home/myuser/pw-browsers

# 5. Scarica il browser modificato direttamente nella cartella sbloccata
RUN npx patchright install chromium
# ------------------------------------------------------------------------

# Copia i file JavaScript compilati dallo stadio builder
COPY --from=builder --chown=myuser:myuser /home/myuser/dist ./dist

# Copia i restanti file di configurazione del codice sorgente
COPY --chown=myuser:myuser . ./

# Comando di avvio nativo dell'Actor su Apify
CMD ["node", "dist/main.js"]