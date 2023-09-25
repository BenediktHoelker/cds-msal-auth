/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
require("dotenv").config();

const express = require("express");
// const expressStaticGzip = require("express-static-gzip");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const compression = require("compression");
const { msalInstance } = require("./authConfig");
const usersRouter = require("./routes/users");
const authRouter = require("./routes/auth");

// Initiates Acquire Token Silent flow
// See: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/accounts.md
async function acquireTokenSilent(req) {
  // Find all accounts
  const msalTokenCache = msalInstance.getTokenCache();

  // Account selection logic would go here
  const account = await msalTokenCache.getAccountByHomeId(
    req.session?.homeAccountId
  );

  if (!account) {
    throw new Error("Not logged in.");
  }

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
async function ensureAuthentication(req, res, next) {
  // if (
  //   req.originalUrl !== "/app/index.html" &&
  //   req.originalUrl !== "/app" &&
  //   !req.originalUrl?.startsWith("/v2")
  // ) {
  //   return next();
  // }

  try {
    const tokenResponse = await acquireTokenSilent(req, res);

    req.session.accessToken = tokenResponse.accessToken;
    req.session.idToken = tokenResponse.idToken;
    req.session.account = tokenResponse.account;
    req.session.homeAccountId = tokenResponse.account.homeAccountId;
  } catch (error) {
    return res.redirect("/auth/signin"); // redirect to sign-in route
  }

  return next();
}
module.exports = function () {
  const router = express.Router();
  router.use(logger("dev"));
  router.use(express.json());
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
        maxAge: 86400000, // expire after one day
        sameSite: false,
        secure: false, // set this to true on production
      },
    })
  );

  router.use("/users", usersRouter);
  router.use("/auth", authRouter);
  router.use("/v2", ensureAuthentication);
  router.use(
    "/",
    ensureAuthentication,
    express.static(`${__dirname}/../../../dist`)
  );

  return router;
};
