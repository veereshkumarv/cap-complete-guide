/**
 * What: Startup guard - refuses to start the service on Cloud Foundry unless authentication is
 *     XSUAA (no mocked users, no dummy auth).
 * Why: [CAP-M11] security review: mocked users with empty passwords exist for development; if a
 *     wrong profile or a missing NODE_ENV=production ever activates them in a deployed app, every
 *     user could log in as Admin. Failing fast is safer than serving.
 * If missing or unlinked: A configuration mistake silently deploys an app with passwordless users.
 */

/**
 * @param {Record<string, string|undefined>} env process environment
 * @param {{ kind?: string }} auth effective cds.env.requires.auth
 */
function assertProductionAuth(env, auth) {
  if (env.VCAP_APPLICATION && auth?.kind !== 'xsuaa') {
    throw new Error(`Refusing to start on Cloud Foundry with auth kind "${auth?.kind}" - expected xsuaa (check NODE_ENV / profiles)`);
  }
}

module.exports = { assertProductionAuth };
