/*
 * Debugger probe for src/lib/security/anti-devtools.ts. Served as a static
 * file (script-src 'self') because the production CSP has no 'unsafe-eval'
 * and the production minifier strips `debugger` statements from the bundle.
 * Files in public/ are never minified, so this one survives.
 */
self.__proggaaDebuggerProbe = function () {
  debugger;
};
