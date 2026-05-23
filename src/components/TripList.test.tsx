import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createTrip } from "@/lib/trips";
import TripList from "./TripList";

beforeEach(async () => {
  await db.trips.clear();
});

describe("TripList", () => {
  it("shows an empty state when there are no trips", async () => {
    render(<TripList />);
    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
  });

  it("renders trips from the database", async () => {
    await createTrip({ name: "Kyoto", startDate: "2026-04-01", endDate: "2026-04-05" });
    render(<TripList />);
    expect(await screen.findByText("Kyoto")).toBeInTheDocument();
  });
});
