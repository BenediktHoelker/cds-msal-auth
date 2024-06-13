/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const authRouter = require("../routes/auth");
const AuthProvider = require("./AuthProvider");

// Initiates Acquire Token Silent flow
// See: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/accounts.md
async function acquireTokenSilent(req) {
  const account = req.session?.account;
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

  return AuthProvider.getMsalInstance().acquireTokenSilent(silentRequest);
}

// custom middleware to check auth state
async function ensureAuthentication(req, res, next) {
  try {
    const tokenResponse = await acquireTokenSilent(req, res, next);

    req.session.accessToken = tokenResponse.accessToken;
    req.session.idToken = tokenResponse.idToken;
    req.session.account = tokenResponse.account;
    return next();
  } catch (error) {
    res.status(401);
    res.send({ message: "Unauthorized. Please reload the page to log in." });
    return res;
  }
}

module.exports = function () {
  const router = express.Router();
  router.use(logger("dev"));
  // router.use(express.json());
  // compress all responses
  router.use(compression());
  router.use(cookieParser());
  router.use(express.urlencoded({ extended: false }));

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
        maxAge: Number(process.env.EXPRESS_COOKIE_MAX_AGE), // expire after one day
        sameSite: false,
        secure: false, // set this to true on production
      },
    })
  );

  router.use("/auth", authRouter);
  router.use("/timetracking", ensureAuthentication);
  router.use("/index.html", async (req, res, next) => {
    const account = req.session?.account;

    if (!account) {
      return res.redirect("/auth/signin");
    }

    return next();
  });

  router.use(
    "/",
    async (req, res, next) => {
      if (req.url !== "/") {
        return next();
      }

      const account = req.session?.account;

      if (!account) {
        return res.redirect("/auth/signin");
      }
      return next();
    },
    express.static(`${__dirname}/../../../${process.env.UI5_WEBAPP_FOLDER}`)
  );

  return router;
};
