import ipaddr from "ipaddr.js";

export function isPublicAddress(value: string) {
  try {
    let address = ipaddr.parse(value) as ipaddr.IPv4 | ipaddr.IPv6;
    if (address.kind() === "ipv6") {
      const ipv6 = address as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) address = ipv6.toIPv4Address();
    }
    if (address.kind() === "ipv4") {
      const normalized = address.toString();
      if (
        [
          "168.63.129.16",
          "169.254.169.254",
          "100.100.100.200",
        ].includes(normalized)
      ) {
        return false;
      }
    }
    return address.range() === "unicast";
  } catch {
    return false;
  }
}
