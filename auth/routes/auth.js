/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const express = require("express");
const msal = require("@azure/msal-node");

const {
  msalConfig,
  msalInstance,
  REDIRECT_URI,
  POST_LOGOUT_REDIRECT_URI,
} = require("../authConfig");

const router = express.Router();
// const msalInstance = new msal.ConfidentialClientApplication(msalConfig);
const cryptoProvider = new msal.CryptoProvider();

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
   * By manipulating the request objects below before each request, we can obtain auth artifacts with desired claims. */
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

  /**
   * The MSAL Node library allows you to pass your custom state as state parameter in the Request object.
   * The state parameter can also be used to encode information of the app's state before redirect.
   * You can pass the user's state in the app, such as the page or view they were on, as input to this parameter.
   */
  const state = cryptoProvider.base64Encode(
    JSON.stringify({
      csrfToken: req.session.csrfToken,
      redirectTo: "/index.html",
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
  if (!req.body || !req.body.state) {
    return next(new Error("Error: response not found"));
  }

  if (!req.session.pkceCodes) {
    return next(new Error("Error: PKCE Codes have not been registered"));
  }

  const authCodeRequest = {
    ...req.session.authCodeRequest,
    code: req.body.code,
    codeVerifier: req.session.pkceCodes.verifier,
  };

  try {
    if (req.session.tokenCache) {
      msalInstance.getTokenCache().deserialize(req.session.tokenCache);
    }

    const tokenResponse = await msalInstance.acquireTokenByCode(
      authCodeRequest,
      req.body
    );

    req.session.accessToken = tokenResponse.accessToken;
    req.session.idToken = tokenResponse.idToken;
    req.session.account = tokenResponse.account;
    req.session.homeAccountId = tokenResponse.account.homeAccountId;
    req.session.isAuthenticated = true;

    const state = JSON.parse(cryptoProvider.base64Decode(req.body.state));
    return res.redirect(state.redirectTo);
  } catch (error) {
    next(error);
  }
});

router.get("/signout", async (req, res) => {
  // const { homeAccountId } = req.session;
  // const currentAccount = msalInstance.getAccountByHomeId(homeAccountId);

  /**
   * Construct a logout URI and redirect the user to end the
   * session with Azure AD. For more information, visit:
   * https://docs.microsoft.com/azure/active-directory/develop/v2-protocols-oidc#send-a-sign-out-request
   */
  const logoutUri = `${msalConfig.auth.authority}/oauth2/v2.0/logout?post_logout_redirect_uri=${POST_LOGOUT_REDIRECT_URI}`;
  return req.session.destroy(() => res.redirect(logoutUri));
});

module.exports = router;
