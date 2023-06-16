/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require("cors");

const { msalInstance } = require("./authConfig");

const usersRouter = require("./routes/users");
const authRouter = require("./routes/auth");

const whitelist = ["http://localhost:8000", "http://localhost:8080"]; // white list consumers
const corsOptions = {
  origin(origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  credentials: true, // Credentials are cookies, authorization headers or TLS client certificates.
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "device-remember-token",
    "Access-Control-Allow-Origin",
    "Origin",
    "Accept",
  ],
};

// https://stackoverflow.com/questions/27117337/exclude-route-from-express-middleware
function unless(middleware, ...paths) {
  return function (req, res, next) {
    const pathCheck = paths.some((path) => path === req.path);
    if (pathCheck) {
      next();
    } else {
      middleware(req, res, next);
    }
  };
}

// Initiates Acquire Token Silent flow
// See: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/accounts.md
async function acquireTokenSilent(req) {
  // Find all accounts
  const msalTokenCache = msalInstance.getTokenCache();

  // Account selection logic would go here
  const [account] = await msalTokenCache.getAllAccounts();

  // The MSGraph token is shortlived => Refresh it regularly
  let forceRefresh = true;
  if (req.session.timer && Date.now() < req.session.timer + 60000 * 30) {
    forceRefresh = false;
  }

  req.session.timer = Date.now();

  // Build silent request after account is selected
  const silentRequest = {
    account,
    forceRefresh,
    scopes: ["User.Read", "Calendars.ReadWrite"],
  };

  return msalInstance.acquireTokenSilent(silentRequest);
}

// custom middleware to check auth state
async function isAuthenticated(req, res, next) {
  try {
    const tokenResponse = await acquireTokenSilent(req, res);

    req.session.accessToken = tokenResponse.accessToken;
    req.session.idToken = tokenResponse.idToken;
    req.session.account = tokenResponse.account;
  } catch (error) {
    res.redirect("/auth/signin"); // redirect to sign-in route
    return;
  }

  next();
}
module.exports = function () {
  const router = express.Router();
  router.use(logger("dev"));
  router.use(express.json());
  router.use(cookieParser());
  router.use(express.urlencoded({ extended: false }));

  router.use(cors(corsOptions));

  /**
   * Using express-session middleware for persistent user session. Be sure to
   * familiarize yourself with available options. Visit: https://www.npmjs.com/package/express-session
   */
  router.use(
    session({
      secret: process.env.EXPRESS_SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: {
        sameSite: false,
        secure: false, // set this to true on production
      },
    })
  );

  router.use("/users", usersRouter);
  router.use("/auth", authRouter);

  router.use(
    unless(
      isAuthenticated,
      "/auth/signin",
      "/auth/redirect",
      "/auth/logout",
      "/images/iot_logo.png",
      "/images/iot_logo_144.png",
      "/images/iot_logo_196.png",
      "/images/iot_logo_198.png"
    )
  );

  return router;
};
