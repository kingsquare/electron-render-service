const express = require("express");
const morgan = require("morgan");
const responseTime = require("response-time");
const { check, validationResult, sanitize } = require("express-validator");
const path = require("path");
const fs = require("fs");

const electronApp = require("electron").app;

electronApp.commandLine.appendSwitch("disable-http-cache");
electronApp.commandLine.appendSwitch("disable-gpu");

const cliSwitchEnv = process.env.CHROMIUM_CLI_SWITCHES;
(cliSwitchEnv ? cliSwitchEnv.split(",") : []).map(electronApp.commandLine.appendSwitch);

const WindowPool = require("./window_pool");
const auth = require("./auth");
const { printUsage, printBootMessage, handleErrors, setContentDisposition } = require("./util");

const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
const PORT = process.env.PORT || 3000;
const LIMIT = 3000; // Constrain screenshots to 3000x3000px
const WINDOW_WIDTH = parseInt(process.env.WINDOW_WIDTH, 10) || 1024;
const WINDOW_HEIGHT = parseInt(process.env.WINDOW_HEIGHT, 10) || 768;
const app = express();

app.use(responseTime());
// app.use(expressValidator());

// Log with token
morgan.token("key-label", (req) => req.keyLabel);
app.use(
  morgan(
    `[:date[iso]] :key-label@:remote-addr - :method :status
 :url :res[content-length] ":user-agent" :response-time ms`.replace("\n", "")
  )
);

app.disable("x-powered-by");
app.enable("trust proxy");

app.post(/^\/(pdf|png|jpeg)/, auth, (req, res, next) => {
  const tmpFile = path.join(
    "/tmp/",
    `${new Date().toUTCString()}-${process.pid}-${(Math.random() * 0x100000000 + 1).toString(36)}.html`
  );

  const writeStream = fs.createWriteStream(tmpFile);
  req.pipe(writeStream);

  writeStream.on("finish", () => {
    if (!fs.statSync(tmpFile).size) {
      res.status(400).send({
        input_errors: [
          {
            param: "body",
            msg: "Please post raw HTML",
          },
        ],
      });
      return;
    }

    // continue as a regular GET request
    /* eslint-disable no-param-reassign */
    req.method = "GET";
    res.locals.tmpFile = tmpFile;
    /* eslint-enable no-param-reassign */
    next();
  });
});

/**
 * GET /pdf - Render PDF
 *
 * See more at https://git.io/vwDaJ
 */
app.get(
  "/pdf",
  auth,
  [
    // Specify page size of the generated PDF
    check("pageSize")
      .optional(true)
      .matches(/A3|A4|A5|Legal|Letter|Tabloid|[0-9]+x[0-9]+/),
    // Specify the type of margins to use
    check("marginsType").optional(true).isInt().isIn([0, 1, 2]).toInt(10),
    // Whether to print CSS backgrounds.
    check("printBackground").optional(true).isBoolean().toBoolean(true),
    // true for landscape, false for portrait.
    check("landscape").optional(true).isBoolean().toBoolean(true),
    // Removes any <link media="print"> stylesheets on page before render.
    check("removePrintMedia").optional(true).isBoolean().toBoolean(true),
    // Specify how long to wait before generating the PDF
    check("delay").optional(true).isInt().toInt(10),
    // Specify a specific string of text to find before generating the PDF
    check("waitForText").optional(true).notEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (errors && errors.length) {
      res.status(400).send({ input_errors: errors });
      return;
    }

    if (!res.locals.tmpFile && !(req.query.url && req.query.url.match(/^https?:\/\/.+$/i))) {
      res.status(400).send({
        input_errors: [
          {
            param: "url",
            msg: "Please provide url or send HTML via POST",
          },
        ],
      });
      return;
    }

    const {
      pageSize = "A4",
      marginsType = 0,
      printBackground = true,
      landscape = false,
      removePrintMedia = false,
      delay = 0,
      waitForText = false,
    } = req.query;
    const url = res.locals.tmpFile ? `file://${res.locals.tmpFile}` : req.query.url;

    req.app.pool.enqueue(
      {
        type: "pdf",
        url,
        pageSize,
        marginsType,
        landscape,
        printBackground,
        removePrintMedia,
        delay,
        waitForText,
      },
      (err, buffer) => {
        if (res.locals.tmpFile) {
          fs.unlink(res.locals.tmpFile, () => {});
        }
        if (handleErrors(err, req, res)) return;

        setContentDisposition(res, "pdf");
        res.type("pdf").send(buffer);
      }
    );
  }
);

/**
 * GET /png|jpeg - Render png or jpeg
 */
app.get(
  /^\/(png|jpeg)/,
  auth,
  [
    // JPEG quality
    check("quality").optional(true).isInt().toInt(),
    // Browser window width
    check("browserWidth").optional(true).isInt().toInt(),
    // Browser window height
    check("browserHeight").optional(true).isInt().toInt(),
    // Specify how long to wait before generating the PDF
    check("delay").optional(true).isInt(),
    // Specify a specific string of text to find before generating the PDF
    check("waitForText").optional(true).notEmpty(),
  ],
  (req, res) => {
    // if (req.query.clippingRect) {
    //   req.check({
    //     'clippingRect.x': { isInt: { errorMessage: 'Invalid value' } },
    //     'clippingRect.y': { isInt: { errorMessage: 'Invalid value' } },
    //     'clippingRect.width': { isInt: { errorMessage: 'Invalid value' } },
    //     'clippingRect.height': { isInt: { errorMessage: 'Invalid value' } },
    //   });
    // }
    //
    // if (req.query.clippingRect) {
    //   req.sanitize('clippingRect.x').toInt(10);
    //   req.sanitize('clippingRect.y').toInt(10);
    //   req.sanitize('clippingRect.width').toInt(10);
    //   req.sanitize('clippingRect.height').toInt(10);
    // }
    const errors = validationResult(req);
    if (errors && errors.length) {
      res.status(400).send({ input_errors: errors });
      return;
    }
    const type = req.params[0];

    if (!res.locals.tmpFile && !(req.query.url && req.query.url.match(/^https?:\/\/.+$/i))) {
      res.status(400).send({
        input_errors: [
          {
            param: "url",
            msg: "Please provide url or send HTML via POST",
          },
        ],
      });
      return;
    }

    const {
      quality = 80,
      delay,
      waitForText,
      clippingRect,
      browserWidth = WINDOW_WIDTH,
      browserHeight = WINDOW_HEIGHT,
    } = req.query;
    const url = res.locals.tmpFile ? `file://${res.locals.tmpFile}` : req.query.url;

    req.app.pool.enqueue(
      {
        type,
        url,
        quality,
        delay,
        waitForText,
        clippingRect,
        browserWidth: Math.min(browserWidth, LIMIT), // Cap width and height to avoid overload
        browserHeight: Math.min(browserHeight, LIMIT),
      },
      (err, buffer) => {
        if (res.locals.tmpFile) {
          fs.unlink(res.locals.tmpFile, () => {});
        }
        if (handleErrors(err, req, res)) return;

        setContentDisposition(res, type);
        res.type(type).send(buffer);
      }
    );
  }
);

/**
 * GET /stats - Output some stats as JSON
 */
app.get("/stats", auth, (req, res) => {
  if (req.keyLabel !== "global") return res.sendStatus(403);
  return res.send(req.app.pool.stats());
});

/**
 * GET / - Print usage
 */
app.get("/", (req, res) => res.send(printUsage()));

// Electron finished booting
electronApp.once("ready", () => {
  electronApp.ready = true;
  app.pool = new WindowPool();
  const listener = app.listen(PORT, HOSTNAME, () => printBootMessage(listener));
});

// Stop Electron on SIG*
process.on("exit", (code) => electronApp.exit(code));

// Passthrough error handler to silence Electron GUI prompt
process.on("uncaughtException", (err) => {
  throw err;
});
