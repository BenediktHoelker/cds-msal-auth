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

/**
 * Overwriting the standard auth function and letting the custom
 * Passport strategy take the wheel
 * @param {Request} req
 * @param {Response} res
 * @param {function} next
 */
module.exports = (req, res, next) => {
  const user = req.session.account?.username;
  DEBUG?.(`[auth] - user defined?${!!user}`);
  if (user) {
    req.user = new CDSUser(user);
    next();
  } else {
    res.status(401).send();
  }
};
