import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the app name", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /triptales/i })
    ).toBeInTheDocument();
  });
});
