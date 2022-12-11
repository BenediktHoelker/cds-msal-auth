/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const logger = require("morgan");

// var indexRouter = require("./routes/index");
const usersRouter = require("./routes/users");
const authRouter = require("./routes/auth");

const { msalInstance } = require("./authConfig");

// Initiates Acquire Token Silent flow
// See: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/accounts.md
async function acquireTokenSilent(req) {
  // Find all accounts
  const msalTokenCache = msalInstance.getTokenCache();

  // Account selection logic would go here
  // TODO: logic for being logged in to multiple accounts at the same time!
  // const [account] = await msalTokenCache.getAllAccounts();

  const { account } = req.session; // Select Account code

  // Build silent request after account is selected
  const silentRequest = {
    account,
    scopes: ["User.Read", "Calendars.ReadWrite"],
  };

  // Acquire Token Silently to be used in MS Graph call
  return msalInstance.acquireTokenSilent(silentRequest).then((response) => {
    req.session.accessToken = response.accessToken;
    req.session.idToken = response.idToken;
    req.session.account = response.account;
    req.session.homeAccountId = response.account.homeAccountId;
    req.session.isAuthenticated = true;
  });
}

// custom middleware to check auth state
function isAuthenticated(req, res, next) {
  if (!req.session.isAuthenticated) {
    return res.redirect("/auth/signin"); // redirect to sign-in route
  }

  next();
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

  app.use("/", async (req, res, next) => {
    // Store the requested URL in order to navigate to it after the redirect (that provided the token)
    req.session.prevUrl = req.url;

    // if (req.path.includes("/v2")) {
    //   try {
    //     await acquireTokenSilent(req);
    //     next();
    //   } catch (error) {
    //     res.redirect("/auth/signin");
    //   }
    // } else {
    //   next();
    // }

    if (
      !req.session.isAuthenticated &&
      (req.path === "/" || req.path.includes("index.html"))
    ) {
      res.redirect("/auth/signin");
    } else if (req.path.includes("/v2")) {
      if (req.session.account) {
        await acquireTokenSilent(req);
      }
      //  else {
      //   res.redirect("/auth/signin");
      // }
    }

    next();

    // else if (
    //   req.session.isAuthenticated ||
    //   req.path === "/auth/signin" ||
    //   req.path.includes("/resources") ||
    //   req.path.includes(".woff2") ||
    //   req.path.includes("iot_logo") ||
    //   req.path.includes("i18n") ||
    //   req.path.includes("manifest.webmanifest")
    // ) {
    //   next();
    // } else {
    //   // try {
    //   //   await acquireTokenSilent(req);
    //   //   next();
    //   // } catch (error) {
    //   // }
    //   return res.redirect("/auth/signin");
    // }
  });

  app.use("/users", usersRouter);
  app.use("/auth", authRouter);

  return router;
};

module.exports = msalAuth;
