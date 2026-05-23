import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Home from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("Home", () => {
  it("renders the app name", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /triptales/i })
    ).toBeInTheDocument();
  });
});
