FROM buildpack-deps:buster-curl

LABEL maintainer="Kingsquare <docker@kingsquare.nl>"
ENV TZ "Europe/Amsterdam"

ENV RENDERER_ACCESS_KEY=changeme \
    CONCURRENCY=1 \
    WINDOW_WIDTH=1024 \
    WINDOW_HEIGHT=768 \
    NODE_ENV=production \
    NODE_VERSION=14 \
    ELECTRON_VERSION=10.1.1 \
    ELECTRON_ENABLE_STACK_DUMPING=true \
    ELECTRON_ENABLE_LOGGING=true

WORKDIR /app

# Add subpixel hinting
COPY .fonts.conf /root/.fonts.conf

# Install the packages needed to run Electron
RUN sed -i 's/main/main contrib/g' /etc/apt/sources.list && \
    apt-get upgrade -y && \
    apt-get update -y

RUN \
    apt-get install -y \
        unzip \
        xvfb \
        libgtk2.0-0 \
		libfontconfig1 \
		ttf-ancient-fonts \
        ttf-mscorefonts-installer \
        libnotify4 \
        libgconf-2-4 \
        libxss1 \
        libnss3 \
        libgbm1 \
        libasound2

RUN \
    apt-get install -y \
        #
        # symbolic font providing emoji characters
        fonts-symbola \
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
        fonts-ancient-scripts
        #ttf-ancient-fonts # in jessie

RUN \
    wget "https://github.com/atom/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-linux-x64.zip" -O electron.zip && \
    unzip electron.zip && rm electron.zip

RUN \
    curl -sL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - && \
    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - && \
    echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list && \
    apt-get update && \
    apt-get install -y \
        nodejs \
        yarn

# Better Emoji support (Unicode 12 from Ubuntu 20.04)
COPY fonts/noto/NotoColorEmoji.ttf /usr/share/fonts/truetype/noto/

RUN apt-get remove -y unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 3000

# The default Xvfb display
ENV DISPLAY :99

# as the inline fonts should not change much put them before the app
#COPY fonts/* /usr/share/fonts/truetype/

ADD package.json /app/package.json
ADD yarn.lock /app/yarn.lock

RUN yarn --production

ADD . /app

CMD ["yarn", "start"]
