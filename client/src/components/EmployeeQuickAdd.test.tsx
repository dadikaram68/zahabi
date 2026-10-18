import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createEmployee: vi.fn(), invalidateConfiguration: vi.fn(), invalidatePayroll: vi.fn() }));

vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ accounting: { configuration: { invalidate: mocks.invalidateConfiguration }, payrollDetails: { invalidate: mocks.invalidatePayroll } } }),
  accounting: {
    configuration: { useQuery: () => ({ data: { currencies: [{ code: "USD" }, { code: "IQD" }] } }) },
    createEmployee: { useMutation: () => ({ mutate: mocks.createEmployee, isPending: false }) },
  },
} }));

import { EmployeeQuickAdd } from "./EmployeeQuickAdd";

describe("EmployeeQuickAdd", () => {
  afterEach(() => { cleanup(); mocks.createEmployee.mockClear(); });

  it("submits a salary in the currency and exchange rate selected by the payroll user", () => {
    render(<EmployeeQuickAdd />);
    fireEvent.change(screen.getByLabelText("اسم الموظف الجديد"), { target: { value: "سارة محمود" } });
    fireEvent.change(screen.getByLabelText("رقم الموظف الجديد"), { target: { value: "EMP-22" } });
    fireEvent.change(screen.getByLabelText("قيمة راتب الموظف الجديد"), { target: { value: "1500000" } });
    fireEvent.change(screen.getByLabelText("عملة راتب الموظف الجديد"), { target: { value: "IQD" } });
    fireEvent.change(screen.getByLabelText("سعر تحويل راتب الموظف الجديد"), { target: { value: "0.00076" } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة الموظف" }));
    expect(mocks.createEmployee).toHaveBeenCalledWith({ fullName: "سارة محمود", employeeNumber: "EMP-22", salaryAmount: 1500000, salaryCurrencyCode: "IQD", salaryExchangeRate: 0.00076 });
  });
});
