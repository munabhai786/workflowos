const truthyValues = new Set(["1", "true", "yes", "on"]);

function readBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return truthyValues.has(String(value).toLowerCase());
}

export const featureFlags = {
  integrationsEnabled: readBooleanFlag(
    import.meta.env.VITE_INTEGRATIONS_ENABLED,
    false
  ),
};
