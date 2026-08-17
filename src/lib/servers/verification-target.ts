export type IdentityVerificationTarget = {
  edition: "java" | "bedrock";
  host: string;
  port: number;
  verificationStatus: "unverified" | "verified";
};

export function selectIdentityVerificationTarget<T extends IdentityVerificationTarget>(
  endpoints: readonly T[],
) {
  return endpoints.find((endpoint) => endpoint.verificationStatus === "verified") ?? endpoints[0];
}
