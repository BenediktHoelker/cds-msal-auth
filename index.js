const cds = require("@sap/cds");

// To debug this module set export DEBUG=cap-msal-auth
const DEBUG = cds.DEBUG?.("cap-msal-auth");

DEBUG?.("[auth] - loading custom auth handler");

const CDSUser = class extends cds.User {
  is(role) {
    DEBUG?.(`[auth] - ${role}`);
    return role === "any" || role === "authenticated-user" || this._roles[role];
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
module.exports = (req, res, next) => {
  const { tenantId, username } = req.session.account || {};
  DEBUG?.(`[auth] - user defined?${!!username}`);
  if (username) {
    req.user = new CDSUser(username);
    req.user.accessToken = req.session.accessToken;
    req.user.tenant = tenantId;
    req.user.schema = formatSchema(tenantId);
    req.headers.authentication = true;
    next();
  } else {
    res.status(401).send();
  }
};
