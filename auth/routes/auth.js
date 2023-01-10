/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const express = require("express");
const {
  msalConfig,
  msalInstance,
  cryptoProvider,
  REDIRECT_URI,
  POST_LOGOUT_REDIRECT_URI,
} = require("../authConfig");

const router = express.Router();

/**
 * Prepares the auth code request parameters and initiates the first leg of auth code flow
 * @param req: Express request object
 * @param res: Express response object
 * @param next: Express next function
 * @param authCodeUrlRequestParams: parameters for requesting an auth code url
 * @param authCodeRequestParams: parameters for requesting tokens using auth code
 */
async function redirectToAuthCodeUrl(
  req,
  res,
  next,
  authCodeUrlRequestParams,
  authCodeRequestParams
) {
  // Generate PKCE Codes before starting the authorization flow
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();

  // Set generated PKCE codes and method as session vars
  req.session.pkceCodes = {
    challengeMethod: "S256",
    verifier,
    challenge,
  };

  /**
   * By manipulating the request objects below before each request, we can obtain
   * auth artifacts with desired claims. For more information, visit:
   * https://azuread.github.io/microsoft-authentication-library-for-js/ref/modules/_azure_msal_node.html#authorizationurlrequest
   * */

  req.session.authCodeUrlRequest = {
    redirectUri: REDIRECT_URI,
    responseMode: "form_post", // recommended for confidential clients
    codeChallenge: req.session.pkceCodes.challenge,
    codeChallengeMethod: req.session.pkceCodes.challengeMethod,
    ...authCodeUrlRequestParams,
  };

  req.session.authCodeRequest = {
    redirectUri: REDIRECT_URI,
    code: "",
    ...authCodeRequestParams,
  };

  // Get url to sign user in and consent to scopes needed for application
  try {
    const authCodeUrlResponse = await msalInstance.getAuthCodeUrl(
      req.session.authCodeUrlRequest
    );
    res.redirect(authCodeUrlResponse);
  } catch (error) {
    next(error);
  }
}

router.get("/signin", async (req, res, next) => {
  // create a GUID for crsf
  req.session.csrfToken = cryptoProvider.createNewGuid();

  const state = cryptoProvider.base64Encode(
    JSON.stringify({
      csrfToken: req.session.csrfToken,
      redirectTo: "/",
    })
  );

  const authCodeUrlRequestParams = {
    state,
    scopes: ["User.Read", "Calendars.ReadWrite"],
  };

  const authCodeRequestParams = {
    scopes: ["User.Read", "Calendars.ReadWrite"],
  };

  // trigger the first leg of auth code flow
  return redirectToAuthCodeUrl(
    req,
    res,
    next,
    authCodeUrlRequestParams,
    authCodeRequestParams
  );
});

router.post("/redirect", async (req, res, next) => {
  if (req.body.state) {
    const state = JSON.parse(cryptoProvider.base64Decode(req.body.state));

    // check if csrfToken matches
    if (state.csrfToken === req.session.csrfToken) {
      req.session.authCodeRequest.code = req.body.code; // auth code
      req.session.authCodeRequest.codeVerifier = req.session.pkceCodes.verifier; // PKCE Code Verifier

      try {
        const tokenResponse = await msalInstance.acquireTokenByCode(
          req.session.authCodeRequest
        );

        // const tokenCache = msalInstance.getTokenCache().serialize();
        // const refreshTokenObject = JSON.parse(tokenCache).RefreshToken;
        // const refreshToken =
        //   refreshTokenObject[Object.keys(refreshTokenObject)[0]].secret;

        req.session.accessToken = tokenResponse.accessToken;
        req.session.idToken = tokenResponse.idToken;
        req.session.account = tokenResponse.account;
        req.session.homeAccountId = tokenResponse.account.homeAccountId;
        req.session.isAuthenticated = true;
        res.redirect(state.redirectTo);
      } catch (error) {
        next(error);
      }
    } else {
      next(new Error("csrf token does not match"));
    }
  } else {
    next(new Error("state is missing"));
  }
});

router.get("/signout", (req, res) => {
  const logoutUri = `${msalConfig.auth.authority}/oauth2/v2.0/logout?post_logout_redirect_uri=${POST_LOGOUT_REDIRECT_URI}`;

  req.session.destroy(() => {
    res.redirect(logoutUri);
  });
});

module.exports = router;
