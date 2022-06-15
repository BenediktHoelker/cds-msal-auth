/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    title: "MSAL Node & Express Web App",
    isAuthenticated: req.session.isAuthenticated,
    username: req.session.account?.username,
  });
});

module.exports = router;
