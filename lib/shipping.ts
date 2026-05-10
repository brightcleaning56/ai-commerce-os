/**
 * Shipping / tracking adapter.
 *
 * Modes:
 *   - "manual" (default): operator pastes carrier + tracking number into the
 *     dashboard. Status updates are operator-driven. Cheapest, no third-party
 *     account needed. Works for any carrier.
 *
 *   - "shippo" (when SHIPPO_TOKEN is set): call Shippo's tracking API to fetch
 *     status updates from any major carrier (FedEx, UPS, DHL, USPS, ~85 others).
 *     Auto-polls + writes status into transaction.shippedAt / deliveredAt.
 *
 * Both modes write the same fields to the transaction. Operator UI is mode-
 * agnostic. The `manual` mode is fine for production at small scale — Shippo
 * is the upgrade for when shipment volume gets high enough to justify
 * automating status updates.
 *
 * Env vars:
 *   SHIPPO_TOKEN     Shippo API token (live or test)
 *
 * Future carriers (direct API integrations, no Shippo middleman):
 *   FEDEX_API_KEY, FEDEX_SECRET
 *   UPS_CLIENT_ID, UPS_CLIENT_SECRET
 *   DHL_API_KEY
 *   FLEXPORT_TOKEN  (for freight + customs at scale)
 */

export type ShippingMode = "manual" | "shippo";

export type Carrier =
  | "fedex"
  | "ups"
  | "dhl"
  | "usps"
  | "ontrac"
  | "lasership"
  | "other";

export type ShippingStatus =
  | "pre_transit"
  | "transit"
  | "delivered"
  | "returned"
  | "failure"
  | "unknown";

export function getShippingMode(): ShippingMode {
  return process.env.SHIPPO_TOKEN ? "shippo" : "manual";
}

/**
 * Look up a tracking number's current status.
 * In manual mode: this is a no-op (operator drives status manually).
 * In shippo mode: calls Shippo's /tracks endpoint.
 */
export async function getTrackingStatus(args: {
  carrier: Carrier;
  trackingNumber: string;
}): Promise<{
  ok: boolean;
  mode: ShippingMode;
  status: ShippingStatus;
  detail?: string;
  carrierStatusCode?: string;
  estimatedDelivery?: string;
  shippedAt?: string;
  deliveredAt?: string;
  errorMessage?: string;
}> {
  const mode = getShippingMode();
  if (mode === "manual") {
    return { ok: true, mode, status: "unknown", detail: "Manual mode — no automatic tracking" };
  }
  // Shippo
  try {
    const res = await fetch(
      `https://api.goshippo.com/tracks/${encodeURIComponent(args.carrier)}/${encodeURIComponent(args.trackingNumber)}`,
      {
        headers: {
          Authorization: `ShippoToken ${process.env.SHIPPO_TOKEN}`,
        },
      },
    );
    const body = await res.json();
    if (!res.ok) {
      return { ok: false, mode, status: "unknown", errorMessage: body.detail ?? `Shippo ${res.status}` };
    }
    const trackingStatus = mapShippoStatus(body.tracking_status?.status);
    return {
      ok: true,
      mode,
      status: trackingStatus,
      detail: body.tracking_status?.status_details,
      carrierStatusCode: body.tracking_status?.status,
      estimatedDelivery: body.eta ?? undefined,
      shippedAt: findFirstStatusDate(body.tracking_history, "TRANSIT"),
      deliveredAt: findFirstStatusDate(body.tracking_history, "DELIVERED"),
    };
  } catch (e) {
    return { ok: false, mode, status: "unknown", errorMessage: e instanceof Error ? e.message : String(e) };
  }
}

function mapShippoStatus(s?: string): ShippingStatus {
  switch (s) {
    case "PRE_TRANSIT": return "pre_transit";
    case "TRANSIT":     return "transit";
    case "DELIVERED":   return "delivered";
    case "RETURNED":    return "returned";
    case "FAILURE":     return "failure";
    default:            return "unknown";
  }
}

function findFirstStatusDate(history: unknown, target: string): string | undefined {
  if (!Array.isArray(history)) return undefined;
  for (const h of history as Array<{ status?: string; status_date?: string }>) {
    if (h.status === target && h.status_date) return h.status_date;
  }
  return undefined;
}

/**
 * Generate a public tracking URL for the given carrier + tracking number.
 * Used in the buyer-facing /transaction page so they can click through to
 * the carrier's site.
 */
export function getCarrierTrackingUrl(carrier: Carrier, trackingNumber: string): string {
  const tn = encodeURIComponent(trackingNumber);
  switch (carrier) {
    case "fedex":      return `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
    case "ups":        return `https://www.ups.com/track?tracknum=${tn}`;
    case "dhl":        return `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`;
    case "usps":       return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`;
    case "ontrac":     return `https://www.ontrac.com/tracking/?number=${tn}`;
    case "lasership":  return `https://www.lasership.com/track/${tn}`;
    default:           return `https://www.google.com/search?q=tracking+${tn}`;
  }
}

/**
 * Pretty carrier label for the UI.
 */
export function carrierLabel(c: Carrier): string {
  switch (c) {
    case "fedex":     return "FedEx";
    case "ups":       return "UPS";
    case "dhl":       return "DHL";
    case "usps":      return "USPS";
    case "ontrac":    return "OnTrac";
    case "lasership": return "LaserShip";
    default:          return "Other";
  }
}
