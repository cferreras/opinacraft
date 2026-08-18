export const serverAccessTypes = ["open", "whitelist"] as const;
export type ServerAccessType = (typeof serverAccessTypes)[number];

export const serverAccountModes = ["premium_only", "premium_and_non_premium"] as const;
export type ServerAccountMode = (typeof serverAccountModes)[number];

export const serverAuthModes = ["direct", "password_non_premium", "password_all"] as const;
export type ServerAuthMode = (typeof serverAuthModes)[number];

export type ServerAccessDetails = {
  accessType: ServerAccessType;
  accessFormUrl: string | null;
  accountMode: ServerAccountMode;
  authMode: ServerAuthMode;
};

export const defaultServerAccess: ServerAccessDetails = {
  accessType: "open",
  accessFormUrl: null,
  accountMode: "premium_only",
  authMode: "direct",
};

export const serverAccessProfiles = [
  {
    accountMode: "premium_only" as const,
    authMode: "direct" as const,
    label: "Solo cuentas premium",
    description: "Entrada directa para cuentas oficiales de Minecraft.",
  },
  {
    accountMode: "premium_and_non_premium" as const,
    authMode: "password_non_premium" as const,
    label: "Premium y no-premium",
    description: "Las cuentas premium entran directas; las no-premium (sin online mode) usan contraseña.",
  },
  {
    accountMode: "premium_and_non_premium" as const,
    authMode: "password_all" as const,
    label: "Premium y no-premium con contraseña",
    description: "Todas las cuentas deben registrarse e iniciar sesión con contraseña dentro del servidor.",
  },
] as const;

export function accessProfileKey(details: Pick<ServerAccessDetails, "accountMode" | "authMode">) {
  return `${details.accountMode}:${details.authMode}` as const;
}

export function accountModeLabel(mode: ServerAccountMode) {
  return mode === "premium_only" ? "Solo premium" : "Premium y no-premium";
}

export function accessTypeLabel(type: ServerAccessType) {
  return type === "whitelist" ? "Whitelist" : "Acceso abierto";
}

export function authModeLabel(details: Pick<ServerAccessDetails, "accountMode" | "authMode">) {
  if (details.accountMode === "premium_only") return "Entrada directa";
  return details.authMode === "password_all"
    ? "Contraseña para todas las cuentas"
    : "Premium directo · no-premium con contraseña";
}
