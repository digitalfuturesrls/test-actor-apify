# Specify the base Docker image. You can read more about
# the available images at https://crawlee.dev/docs/guides/docker-images
# You can also use any other image from Docker Hub.
FROM apify/actor-node-playwright-chrome:24-1.60.0 AS builder

# Check preinstalled packages
RUN npm ls @crawlee/core apify puppeteer playwright patchright

# Copy just package.json and package-lock.json
# to speed up the build using Docker layer cache.
COPY --chown=myuser:myuser package*.json Dockerfile ./

# Check patchright version is compatible with pre-installed Playwright browsers.
RUN node check-playwright-version.mjs

# Install all dependencies. Don't audit to speed up the installation.
RUN npm install --include=dev --audit=false

# Next, copy the source files using the user set
# in the base image.
COPY --chown=myuser:myuser . ./

# Install all dependencies and build the project.
# Don't audit to speed up the installation.
RUN npm run build

# Download patchright's stealth Chromium binary.
# The postinstall script only installs Playwright browsers (for @crawlee/playwright),
# not patchright's own patched Chromium. Without this, the COPY at line 58 would
# fail because node_modules/patchright/chromium would not exist in the builder stage.
# Omit --with-deps: the base image apify/actor-node-playwright-chrome already ships
# all required system libs (libnss3, libatk-bridge, etc.) for Chromium.

USER root

RUN npx patchright install chromium 

USER myuser

# Create final image
FROM apify/actor-node-playwright-chrome:24-1.60.0

# Check preinstalled packages
RUN npm ls @crawlee/core apify puppeteer playwright

# Copy just package.json and package-lock.json
# to speed up the build using Docker layer cache.
COPY --chown=myuser:myuser package*.json ./

# Install NPM packages, skip optional and development dependencies to
# keep the image small. Avoid logging too much and print the dependency
# tree for debugging
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version \
    && rm -r ~/.npm

# Scarica il browser modificato di Patchright direttamente nello stadio finale.
# Viene salvato nella cache di sistema corretta senza bisogno di COPY manuali.
RUN npx patchright install chromium

# Copy built JS files from builder image
COPY --from=builder --chown=myuser:myuser /home/myuser/dist ./dist

# Next, copy the remaining files and directories with the source code.
# Poiché node_modules/patchright/chromium non viene più toccato, 
# non c'è rischio di sovrascrivere o perdere i binari del browser.
COPY --chown=myuser:myuser . ./

# Run the image.
CMD ["node", "dist/main.js"]