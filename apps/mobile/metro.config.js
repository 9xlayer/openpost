const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);
const dependencyRoots = [
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules"),
];

config.watchFolders = [
  path.join(workspaceRoot, "packages", "api-contract"),
  path.join(workspaceRoot, "packages", "dither"),
  path.join(workspaceRoot, "packages", "query-catalog"),
];
config.resolver.nodeModulesPaths = dependencyRoots;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = (name) =>
    context.resolveRequest(
      { ...context, disableHierarchicalLookup: true, nodeModulesPaths: dependencyRoots },
      name,
      platform,
    );
  try {
    return resolve(moduleName);
  } catch (error) {
    // Workspace ESM sources name their emitted .js siblings. Metro reads their
    // TypeScript react-native entry, so resolve that sibling before giving up.
    if (
      moduleName.startsWith(".") &&
      moduleName.endsWith(".js") &&
      context.originModulePath.startsWith(path.join(workspaceRoot, "packages") + path.sep)
    ) {
      return resolve(moduleName.slice(0, -3) + ".ts");
    }
    throw error;
  }
};
module.exports = config;
