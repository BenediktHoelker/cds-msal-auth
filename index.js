const cds = require("@sap/cds");

// To debug this module set export DEBUG=cap-msal-auth
const DEBUG = cds.DEBUG?.("cap-msal-auth");

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

/**
 * Overwriting the standard auth function and letting the custom
 * Passport strategy take the wheel
 * @param {Request} req
 * @param {Response} res
 * @param {function} next
 */
module.exports = async (req, res, next) => {
  const { tenantId, username } = req.session?.account || {};
  DEBUG?.(`[auth] - user defined?${!!username}`);

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
};
