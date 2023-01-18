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

// Initiates Acquire Token Silent flow
// See: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/accounts.md
async function acquireTokenSilent(req, res, next) {
  // Find all accounts
  // const msalInstance = new msal.ConfidentialClientApplication(msalConfig);
  const msalTokenCache = msalInstance.getTokenCache();

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
    req.user.accessToken = response.accessToken;
  });
}

const msalAuth = function (app) {
  const router = express.Router();

  app.use(logger("dev"));
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false }));
  // app.use(express.static(path.join(__dirname, "public")));

  /**
   * Using express-session middleware for persistent user session. Be sure to
   * familiarize yourself with available options. Visit: https://www.npmjs.com/package/express-session
   */
  app.use(
    session({
      secret: process.env.EXPRESS_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // set this to true on production
      },
    })
  );

  // app.use("/", indexRouter);
  app.use("/users", usersRouter);
  app.use("/auth", authRouter);

  app.use("/", async (req, res, next) => {
    // Store the requested URL in order to navigate to it after the redirect (that provided the token)
    req.session.prevUrl = req.url;

    if (req.path.includes("/v2/") || req.path.includes("/v4/")) {
      try {
        // Acquire Token Silently to be used in MS Graph call
        // TODO: reconsider performance (atm) each request waits for a refreshed token
        await acquireTokenSilent(req, res);
      } catch (error) {
        res.redirect("/auth/signin");
        return;
      }
    }

    if (
      req.session.isAuthenticated ||
      req.path === "/auth/signin" ||
      // req.path === "/index.html" ||
      req.path.includes("/resources") ||
      req.path.includes("service-worker.js") ||
      req.path.includes(".woff2") ||
      req.path.includes("iot_logo") ||
      req.path.includes("i18n") ||
      req.path.includes("favicon.ico") ||
      req.path.includes("manifest.json") ||
      req.path.includes("manifest.webmanifest")
    ) {
      next();
    } else {
      res.redirect("/auth/signin");
    }
  });

  return router;
};

module.exports = msalAuth;
