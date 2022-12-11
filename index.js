const cds = require("@sap/cds");

// To debug this module set export DEBUG=cap-msal-auth
const DEBUG = cds.DEBUG?.("cap-msal-auth");
const { msalInstance } = require("./auth/authConfig");

DEBUG?.("[auth] - loading custom auth handler");

const CDSUser = class extends cds.User {
  is(role) {
    DEBUG?.(`[auth] - ${role}`);
    return role === "any" || this._roles[role];
  }
};

function formatSchema(tenantID) {
  // postgreSQL does not allow first character "0" in schema name
  let schema = `_${tenantID}`;
  // postgreSQL seems to error when passing '-' to schema name
  schema = schema.replace(/-/g, "");
  return schema;
}

// Initiates Acquire Token Silent flow
// See: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/accounts.md
async function acquireTokenSilent(req, res, next) {
  // Find all accounts
  const msalTokenCache = msalInstance.getTokenCache();

  // Account selection logic would go here
  // const [account] = await msalTokenCache.getAllAccounts();

  const { account } = req.session; // Select Account code

  // Build silent request after account is selected
  const silentRequest = {
    account,
    scopes: ["User.Read", "Calendars.ReadWrite"],
  };

  // Acquire Token Silently to be used in MS Graph call
  const response = await msalInstance.acquireTokenSilent(silentRequest);

  req.session.accessToken = response.accessToken;
  req.session.idToken = response.idToken;
  req.session.account = response.account;
  req.session.homeAccountId = response.account.homeAccountId;
  req.session.isAuthenticated = true;
}

/**
 * Overwriting the standard auth function and letting the custom
 * Passport strategy take the wheel
 * @param {Request} req
 * @param {Response} res
 * @param {function} next
 */
module.exports = async (req, res, next) => {
  await acquireTokenSilent(req);

  const { tenantId, username } = req.session.account || {};
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
