/* eslint-disable no-console */
const pjson = require("../package.json");
const { BrowserWindow, session } = require("electron");
const retry = require("retry");
const path = require("path");
const fs = require("fs");

const { validateResult, RendererError } = require("./error_handler");

const TIMEOUT = parseInt(process.env.TIMEOUT, 10) || 30;
const DEVELOPMENT = process.env.NODE_ENV === "development";
const WINDOW_WIDTH = parseInt(process.env.WINDOW_WIDTH, 10) || 1024;
const WINDOW_HEIGHT = parseInt(process.env.WINDOW_HEIGHT, 10) || 768;
const DEFAULT_HEADERS = "Cache-Control: no-cache, no-store, must-revalidate\nPragma: no-cache";

/**
 * Render PDF
 */
const pdfFailedFixture = fs.readFileSync(path.resolve(__dirname, "./fixtures/render_failed.pdf"));

function renderPDF(options, done) {
  // Remove print stylesheets prior rendering
  if (options.removePrintMedia) {
    const selector = 'document.querySelectorAll(\'link[rel="stylesheet"][media="print"]\')';
    const code = `Array.prototype.forEach.call(${selector}, s => s.remove());`;
    this.webContents.executeJavaScript(code);
  }

  // Support setting page size in microns with NxN syntax
  const customPage = options.pageSize.match(/([0-9]+)x([0-9]+)/);
  if (customPage) {
    options.pageSize = {
      // eslint-disable-line no-param-reassign
      width: parseInt(customPage[1], 10),
      height: parseInt(customPage[2], 10),
    };
  }

  let tries = 0;
  const attemptRender = () => {
    tries += 1;
    if (tries > 5) {
      done(new Error("Render failed"));
      return;
    }
    this.webContents
      .printToPDF(options)
      .then((data) => {
        if (data.slice(150).compare(pdfFailedFixture.slice(150)) === 0) {
          // Slice out ModDate
          console.log("Pdf empty, creation failed! Retrying...");
          setTimeout(attemptRender, 50);
          return;
        }
        done(undefined, data);
      })
      .catch((err) => {
        console.log("printToPDF", "ERRORRED");
        done(err);
      });
  };

  attemptRender();
}

/**
 * Render image png/jpeg
 */
function renderImage({ type, quality, browserWidth, browserHeight, clippingRect }, done) {
  if (clippingRect) {
    // Avoid stretching by adding rect coordinates to size
    this.setSize(browserWidth + clippingRect.x, browserHeight + clippingRect.y);
  } else {
    this.setSize(browserWidth, browserHeight);
  }
  setTimeout(
    () =>
      this.capturePage(clippingRect)
        .then((image) => done(null, type === "png" ? image.toPNG() : image.toJPEG(quality)))
        .catch((ex) => done(ex)),
    50
  );
}

/**
 * Render job with error handling
 */
exports.renderWorker = function renderWorker(window, task, done) {
  const { webContents } = window;
  let waitOperation = null;

  const timeoutTimer = setTimeout(() => webContents.emit("timeout"), TIMEOUT * 1000);

  if (task.waitForText !== false) {
    waitOperation = retry.operation({
      retries: TIMEOUT,
      factor: 1,
      minTimeout: 750,
      maxTimeout: 1000,
    });
  }

  webContents.once("finished", (type, ...args) => {
    clearTimeout(timeoutTimer);

    function renderIt() {
      validateResult(task.url, type, ...args)
        // Page loaded successfully
        .then(() => (task.type === "pdf" ? renderPDF : renderImage).call(window, task, done))
        .catch((ex) => done(ex));
    }

    if (type !== "did-finish-load") {
      renderIt();

      // Delay rendering n seconds
    } else if (task.delay > 0) {
      console.log("delaying pdf generation by %sms", task.delay * 1000);
      setTimeout(renderIt, task.delay * 1000);

      // Look for specific string before rendering
    } else if (task.waitForText) {
      console.log('delaying pdf generation, waiting for text "%s" to appear', task.waitForText);
      waitOperation.attempt(() => {
        webContents.findInPage(""); // TODO: Workaround for https://crbug.com/670498
        webContents.findInPage(task.waitForText);
      });

      webContents.on("found-in-page", function foundInPage(event, result) {
        if (result.matches === 0) {
          const isRetrying = waitOperation.retry(new Error("not ready to render"));

          if (!isRetrying) {
            done(new RendererError("TEXT_NOT_FOUND", `Failed to find text: ${task.waitForText}`, 404));
            webContents.removeListener("found-in-page", foundInPage);
          }
        } else if (result.finalUpdate) {
          webContents.stopFindInPage("clearSelection");
          webContents.removeListener("found-in-page", foundInPage);
          renderIt();
        }
      });
    } else {
      renderIt();
    }
  });

  webContents.loadURL(task.url, { extraHeaders: DEFAULT_HEADERS });
};

/**
 * Create BrowserWindow
 */
exports.createWindow = function createWindow() {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    frame: DEVELOPMENT,
    show: DEVELOPMENT,
    transparent: true,
    enableLargerThanScreen: true,
    webPreferences: {
      blinkFeatures: "OverlayScrollbars", // Slimmer scrollbars
      allowDisplayingInsecureContent: true, // Show http content on https site
      allowRunningInsecureContent: true, // Run JS, CSS from http urls
      nodeIntegration: false, // Disable exposing of Node.js symbols to DOM
    },
  });

  // Set user agent
  const { webContents } = window;
  webContents.setUserAgent(`${webContents.getUserAgent()} ${pjson.name}/${pjson.version}`);

  // session.defaultSession.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
  //   const test_url = details.url;
  //   const check_block_list = /\.(gr|hk||fm|eu|it|es|is|net|ke|me||tz|za|zm|uk|us|in|com|de|fr|zw|tv|sk|se|php|pk|pl)\/ads?[\-_./\?]|(stats?|rankings?|tracks?|trigg|webtrends?|webtrekk|statistiche|visibl|searchenginejournal|visit|webstat|survey|spring).*.(com|net|de|fr|co|it|se)|\/statistics\/|torrent|[\-_./]ga[\-_./]|[\-_./]counter[\-_./\?]|ad\.admitad\.|\/widgets?[\-_./]?ads?|\/videos?[\-_./]?ads?|\/valueclick|userad|track[\-_./]?ads?|\/top[\-_./]?ads?|\/sponsor[\-_./]?ads?|smartadserver|\/sidebar[\-_]?ads?|popunder|\/includes\/ads?|\/iframe[-_]?ads?|\/header[-_]?ads?|\/framead|\/get[-_]?ads?|\/files\/ad*|exoclick|displayad|\ajax\/ad|adzone|\/assets\/ad*|advertisement|\/adv\/*\.|ad-frame|\.com\/bads\/|follow-us|connect-|-social-|googleplus.|linkedin|footer-social.|social-media|gmail|commission|adserv\.|omniture|netflix|huffingtonpost|dlpageping|log204|geoip\.|baidu|reporting\.|paypal|maxmind|geo\.|api\.bit|hits|predict|cdn-cgi|record_|\.ve$|radar|\.pop|\.tinybar\.|\.ranking|.cash|\.banner\.|adzerk|gweb|alliance|adf\.ly|monitor|urchin_post|imrworldwide|gen204|twitter|naukri|hulu.com|baidu|seotools|roi-|revenue|tracking.js|\/tracking[\-_./]?|elitics|demandmedia|bizrate|click-|click\.|bidsystem|affiliates?\.|beacon|hit\.|googleadservices|metrix|googleanal|dailymotion|ga.js|survey|trekk|visit_|arcadebanners?|visitor\.|ielsen|cts\.|link_|ga-track|FacebookTracking|quantc|traffic|evenuescien|roitra|pixelt|pagetra|metrics|[-_/.]?stats?[.-_/]?|common_|accounts\.|contentad|iqadtile|boxad|audsci.js|ebtrekk|seotrack|clickalyzer|youtube|\/tracker\/|ekomi|clicky|[-_/.]?click?[.-_/]?|[-_/.]?tracking?[.-_/]?|[-_/.]?track?[.-_/]?|ghostery|hscrm|watchvideo|clicks4ads|mkt[0-9]|createsend|analytix|shoppingshadow|clicktracks|admeld|google-analytics|-analytic|googletagservices|googletagmanager|tracking\.|thirdparty|track\.|pflexads|smaato|medialytics|doubleclick|cloudfront|-static|-static-|static-|sponsored-banner|static_|_static_|_static|sponsored_link|sponsored_ad|googleadword|analytics\.|googletakes|adsbygoogle|analytics-|-analytic|analytic-|googlesyndication|google_adsense2|googleAdIndexTop|\/ads\/|google-ad-|google-ad?|google-adsense-|google-adsense.|google-adverts-|google-adwords|google-afc-|google-afc.|google\/ad\?|google\/adv\.|google160.|google728.|_adv|google_afc.|google_afc_|google_afs.|google_afs_widget|google_caf.js|google_lander2.js|google_radlinks_|googlead|googleafc.|googleafs.|googleafvadrenderer.|googlecontextualads.|googleheadad.|googleleader.|googleleads.|googlempu.|ads_|_ads_|_ads|easyads|easyads|easyadstrack|ebayads|[.\-_/\?](ads?|clicks?|tracks?|tracking|logs?)[.\-_/]?(banners?|mid|trends|pathmedia|tech|units?|vert*|fox|area|loc|nxs|format|call|script|final|systems?|show|tag\.?|collect*|slot|right|space|taily|vids?|supply|true|targeting|counts?|nectar|net|onion|parlor|2srv|searcher|fundi|nimation|context|stats?|vertising|class|infuse|includes?|spacers?|code|images?|vers|texts?|work*|tail|track|streams?|ability||world*|zone|position|vertisers?|servers?|view|partner|data)[.\-_/]?/gi;
  //   const check_white_list = /status|premoa.*.jpg|rakuten|nitori-net|search\?tbs\=sbi\:|google.*\/search|ebay.*static.*g|\/shopping\/product|aclk?|translate.googleapis.com|encrypted-|product|www.googleadservices.com\/pagead\/aclk|target.com|.css/gi;
  //   const block_me = check_block_list.test(test_url);
  //   const release_me = check_white_list.test(test_url);
  //
  //   if (release_me) {
  //     callback({ cancel: false });
  //   } else if (block_me) {
  //     console.log("blocking", test_url);
  //     callback({ cancel: true });
  //   } else {
  //     callback({ cancel: false });
  //   }
  // });

  // , "render-process-gone"

  // Emit end events to an aggregate for worker to listen on once
  ["did-fail-load", "crashed", "did-finish-load", "timeout"].forEach((e) => {
    webContents.on(e, (...args) => webContents.emit("finished", e, ...args));
  });

  return window;
};
