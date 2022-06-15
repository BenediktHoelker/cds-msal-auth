/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const express = require("express");
const fetch = require("../fetch");
const { GRAPH_ME_ENDPOINT } = require("../authConfig");

const router = express.Router();

// custom middleware to check auth state
function isAuthenticated(req, res, next) {
  if (!req.session.isAuthenticated) {
    res.redirect("/auth/signin"); // redirect to sign-in route
    return;
  }

  next();
}

router.get(
  "/id",
  isAuthenticated, // check if user is authenticated
  async (req, res) => {
    res.json({ idTokenClaims: req.session.account.idTokenClaims });
  }
);

router.get(
  "/profile",
  isAuthenticated, // check if user is authenticated
  async (req, res, next) => {
    try {
      const graphResponse = await fetch(
        GRAPH_ME_ENDPOINT,
        req.session.accessToken
      );
      res.json({ profile: graphResponse });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
