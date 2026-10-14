/**
 * Read-only access to TATO (tatocar.co), the shop's own Turo fleet
 * manager, through its agent API (`GET /api/agent`, Bearer token from
 * TATO's account settings). The workbench uses it to turn a plate or a
 * nickname into the car's year, model and VIN, and to see when the car is
 * out on a trip.
 *
 * TATO's orders carry guests' names and phone numbers; nothing here keeps
 * them. Only times and trip status leave this module.
 */

const DEFAULT_BASE = "https://tatocar.co";
const TIMEOUT_MS = 12_000;

export class TatoError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "http" | "upstream",
  ) {
    super(message);
    this.name = "TatoError";
  }
}

export interface FleetCar {
  id: string;
  plate: string;
  nickname: string;
  year: number | null;
  brand: string;
  model: string;
  vin: string;
  /** available | maintenance */
  status: string;
  /** Revenue-share owner; null for the shop's own cars. */
  owner: string | null;
}

export interface FleetTrip {
  /** booked | ongoing */
  status: string;
  pickup: string;
  return: string;
}

interface AgentVehicle {
  id: string;
  plateNumber: string;
  nickname?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  vin?: string | null;
  status?: string | null;
  owner?: { name?: string | null } | null;
}

interface AgentOrder {
  status: string;
  pickupDatetime: string | null;
  returnDatetime: string | null;
}

export class TatoClient {
  constructor(
    private readonly token: string,
    private readonly base: string = DEFAULT_BASE,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = `${this.base}${path}?${new URLSearchParams(params)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" }, signal: controller.signal });
    } catch (error) {
      throw new TatoError(`TATO request failed: ${(error as Error).name}`, "upstream");
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401) throw new TatoError("TATO rejected the API token", "auth");
    if (!response.ok) throw new TatoError(`TATO ${path} failed with ${response.status}`, "http");
    return (await response.json()) as T;
  }

  /** Cars whose plate, nickname, brand, model, VIN or listing name contains the text. */
  async findCars(query: string): Promise<FleetCar[]> {
    const text = query.trim().slice(0, 40);
    if (!text) return [];
    // TATO matches case-sensitively; plates are stored in capitals without spaces.
    const attempts = [...new Set([text, text.toUpperCase().replace(/[\s-]/g, ""), text.toUpperCase()])];
    for (const q of attempts) {
      const { data } = await this.get<{ data: AgentVehicle[] }>("/api/agent/vehicles", { q, limit: "10" });
      if (data.length) return data.map(toCar);
    }
    return [];
  }

  /** The car's current trip and its upcoming bookings, soonest first. */
  async upcomingTrips(vehicleId: string, now = new Date()): Promise<FleetTrip[]> {
    const [ongoing, booked] = await Promise.all(
      ["ongoing", "booked"].map((status) =>
        this.get<{ data: AgentOrder[] }>("/api/agent/orders", { vehicleId, status, limit: "50" }).then((r) => r.data),
      ),
    );
    const soon = now.getTime() - 24 * 3600_000;
    return [...ongoing, ...booked]
      .filter((o) => o.pickupDatetime && o.returnDatetime)
      .filter((o) => o.status === "ongoing" || Date.parse(o.returnDatetime!) >= soon)
      .map((o) => ({ status: o.status, pickup: o.pickupDatetime!, return: o.returnDatetime! }))
      .sort((a, b) => Date.parse(a.pickup) - Date.parse(b.pickup));
  }
}

function toCar(v: AgentVehicle): FleetCar {
  return {
    id: v.id,
    plate: v.plateNumber,
    nickname: v.nickname ?? "",
    year: typeof v.year === "number" ? v.year : null,
    brand: v.brand ?? "",
    model: v.model ?? "",
    vin: (v.vin ?? "").trim().toUpperCase(),
    status: v.status ?? "",
    owner: v.owner?.name?.trim() || null,
  };
}

export function tatoConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TATO_API_TOKEN?.trim());
}

let shared: TatoClient | null = null;

export function getTatoClient(): TatoClient | null {
  const token = process.env.TATO_API_TOKEN?.trim();
  if (!token) return null;
  shared ??= new TatoClient(token, process.env.TATO_BASE_URL?.trim() || DEFAULT_BASE);
  return shared;
}
