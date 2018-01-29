FROM buildpack-deps:jessie-curl

MAINTAINER Mihkel Sokk <mihkelsokk@gmail.com>

ENV RENDERER_ACCESS_KEY=changeme CONCURRENCY=1 WINDOW_WIDTH=1024 WINDOW_HEIGHT=768 NODE_ENV=production \
    ELECTRON_VERSION=1.7.9 ELECTRON_ENABLE_STACK_DUMPING=true ELECTRON_ENABLE_LOGGING=true

WORKDIR /app

# Add subpixel hinting
COPY .fonts.conf /root/.fonts.conf

    # Install the packages needed to run Electron
RUN sed -i 's/main/main contrib/g' /etc/apt/sources.list && \
    curl -sL https://deb.nodesource.com/setup_8.x | bash - && \
    apt-get upgrade -y && \
    apt-get install -y unzip xvfb libgtk2.0-0 ttf-mscorefonts-installer libnotify4 libgconf2-4 libxss1 libnss3 dbus-x11 && \
    \
    # Get Electron
    wget "https://github.com/atom/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-linux-x64.zip" -O electron.zip && \
    unzip electron.zip && rm electron.zip && \
    \
    apt-get install -y \
        #
        # symbolic font providing emoji characters
        #fonts-symbola # from stretch unicode v7.0 # ttf-ancient-fonts in jessie (unicode v6.0)  \
        #
        #  "Noto" is short for "No Tofu", describing the aim of covering all living Unicode scripts (currently 43 are covered, at least partly, across hinted and unhinted).
        fonts-noto \
        #
        # "AR PL UMing" Chinese Unicode TrueType font collection Mingti style
        fonts-arphic-uming \
        #
        # "WenQuanYi Zen Hei" A Hei-Ti Style (sans-serif) Chinese font
        fonts-wqy-zenhei \
        #
        # Japanese OpenType font set, IPA Mincho and IPA P Mincho Fonts
        fonts-ipafont-mincho \
        #
        # Japanese OpenType font set, IPA Gothic and IPA P Gothic Fonts
        fonts-ipafont-gothic \
        #
        # VL Gothic is beautiful Japanese free Gothic TrueType font, developed by Project Vine.
        fonts-vlgothic \
        #
        # Un series Korean TrueType fonts
        fonts-unfonts-core \
        #
        # TrueType and Type1 Hebrew Fonts for X11: Those families provide a basic set of a serif (Frank Ruehl), sans serif (Nachlieli) and monospaced (Miriam Mono) fonts. Also included Miriam, Drugulin, Aharoni, David, Hadasim etc. Cantillation marks support is available in Keter YG.
        #fonts-culmus \ # from stretch # culmus in jessie
        culmus \
        #
        # TrueType Arabic fonts released by the King Abdulaziz City for Science and Technology (KACST)
        fonts-kacst \
        #
        # Unicode Fonts for Ancient Scripts; Egyptian Hieroglyphs, Sumero-Akkadian Cuneiform, and Musical Symbols in the Unicode Standard
        #fonts-ancient-scripts # from stretch
        #ttf-ancient-fonts # in jessie
        ttf-ancient-fonts \
        && \
    # Cleanup
    apt-get remove -y unzip && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package.json /app/package.json

# Add extra fonts included within this dist
COPY fonts/* /usr/share/fonts/truetype/

RUN apt-get update && apt-get install -y nodejs && \
    sed -i '/\"electron\"\:/d' ./package.json && \
    npm install --production --no-optional && \
    apt-get remove -y nodejs && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY . /app

EXPOSE 3000
CMD ["sh", "-c", "[ -e /tmp/.X99-lock ] && rm /tmp/.X99-lock; xvfb-run -e /dev/stdout --server-args=\"-screen 0 ${WINDOW_WIDTH}x${WINDOW_HEIGHT}x24\" ./electron --disable-gpu src/server.js"]
