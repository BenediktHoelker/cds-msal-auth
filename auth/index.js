/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const logger = require("morgan");

const msal = require("@azure/msal-node");
const { msalConfig, msalInstance } = require("./authConfig");

// var indexRouter = require("./routes/index");
const usersRouter = require("./routes/users");
const authRouter = require("./routes/auth");

const router = express.Router();

// Initiates Acquire Token Silent flow
// See: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/accounts.md
async function acquireTokenSilent(req, res, next) {
  // Find all accounts
  // const msalInstance = new msal.ConfidentialClientApplication(msalConfig);
  // const msalTokenCache = msalInstance.getTokenCache();

  // Account selection logic would go here
  // const [account] = await msalTokenCache.getAllAccounts();

  const { account } = req.session || {}; // Select Account code

  // Build silent request after account is selected
  const silentRequest = {
    account,
    scopes: ["User.Read", "Calendars.ReadWrite"],
  };

  return msalInstance.acquireTokenSilent(silentRequest).then((response) => {
    req.session.accessToken = response.accessToken;
  });
}

// custom middleware to check auth state
function isAuthenticatedIndexHTML(req, res, next) {
  if (!req.session.isAuthenticated) {
    return res.redirect("/auth/signin"); // redirect to sign-in route
  }

  next();
}

function isAuthenticated(req, res, next) {
  if (!req.session.isAuthenticated) {
    return res.status(401).send(); // redirect to sign-in route
  }

  next();
}

module.exports = function (options = {}) {
  router.use(logger("dev"));
  router.use(express.json());
  router.use(cookieParser());
  router.use(express.urlencoded({ extended: false }));
  // app.use(express.static(path.join(__dirname, "public")));

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

  router.use("/index.html", isAuthenticatedIndexHTML, async (req, res, next) =>
    next()
  );

  router.use("/v2", isAuthenticated, async (req, res, next) => {
    // TODO: check for server-address with regex: https://blogs.sap.com/2021/10/14/create-authenticated-endpoints-in-cap-that-serve-any-type-of-response/
    // if (req.path.includes("/timetracking/")) {
    try {
      // Acquire Token Silently to be used in MS Graph call
      // TODO: reconsider performance (atm) each request waits for a refreshed token
      await acquireTokenSilent(req, res);
    } catch (err) {
      req.session.isAuthenticated = false;
      res.status(401).json({
        status: 401,
        name: err.name,
        path: err.path,
        errors: err.errors,
        message: err.errorMessage,
        stack: err.stack,
      });
      return;
    }
    // }

    next();
  });

  router.use("/users", usersRouter);
  router.use("/auth", authRouter);

  return router;
};
