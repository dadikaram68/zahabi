import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { PayrollPeriodForm } from "./PayrollPeriodForm";

describe("PayrollPeriodForm", () => {
  it("sends the selected start and end dates to payroll creation", () => {
    const onCreate = vi.fn();
    render(<PayrollPeriodForm isPending={false} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("بداية الفترة"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("نهاية الفترة"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء مسير رواتب" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-31T23:59:59.999Z"),
    }));
  });
});
