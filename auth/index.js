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

  app.use("/", (req, res, next) => {
    // Store the requested URL in order to navigate to it after the redirect (that provided the token)
    req.session.prevUrl = req.url;

    if (
      req.session.isAuthenticated ||
      req.path === "/auth/signin" ||
      req.path.includes("/resources") ||
      req.path.includes("service-worker.js") ||
      req.path.includes(".woff2") ||
      req.path.includes("iot_logo") ||
      req.path.includes("i18n") ||
      req.path.includes("favicon.ico") ||
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
