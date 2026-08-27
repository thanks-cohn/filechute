import "./service-worker.js";

// FileChute's canonical drop bridge is now a normal content script on every
// http/https page declared in manifest.json. Keeping bootstrap injection here
// would create duplicate receiver instances and reintroduce the exact class of
// double-consumption bug found during the Windows drag investigation.
