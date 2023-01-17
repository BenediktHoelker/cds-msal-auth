const cds = require("@sap/cds");
const msal = require("@azure/msal-node");

// To debug this module set export DEBUG=cap-msal-auth
const DEBUG = cds.DEBUG?.("cap-msal-auth");
const { msalConfig, msalInstance } = require("./auth/authConfig");

DEBUG?.("[auth] - loading custom auth handler");

const CDSUser = class extends cds.User {
  is(role) {
    DEBUG?.(`[auth] - ${role}`);
    return role === "any" || this._roles[role];
  }
};

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
    req.session.idToken = response.idToken;
    req.session.account = response.account;
    req.session.homeAccountId = response.account.homeAccountId;
    req.session.isAuthenticated = true;
  });
}

function formatSchema(tenantID) {
  // postgreSQL does not allow first character "0" in schema name
  let schema = `_${tenantID}`;
  // postgreSQL seems to error when passing '-' to schema name
  schema = schema.replace(/-/g, "");
  return schema;
}

/**
 * Overwriting the standard auth function and letting the custom
 * Passport strategy take the wheel
 * @param {Request} req
 * @param {Response} res
 * @param {function} next
 */
module.exports = async (req, res, next) => {
  try {
    // Acquire Token Silently to be used in MS Graph call
    // TODO: reconsider performance (atm) each request waits for a refreshed token
    await acquireTokenSilent(req, res);
  } catch (error) {
    res.status(401).send({
      message: "The MSGraph Access Token has expired. Please re-login.",
    });
    return;
  }

  const { tenantId, username } = req.session?.account || {};
  DEBUG?.(`[auth] - user defined?${!!username}`);

  if (username) {
    const { roles = [] } = req.session.account.idTokenClaims;

    req.user = new CDSUser({
      id: username,
      tenant: tenantId,
      _roles: ["authenticated-user", ...roles],
    });

    req.user.accessToken = req.session.accessToken;
    req.user.homeAccountId = req.session.homeAccountId;
    req.user.account = req.session.account;
    req.user.attr.tenant = tenantId;
    req.user.schema = formatSchema(tenantId);
    req.headers.authentication = true;
    next();
  } else {
    res.status(401).send();
  }
};
