import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ login: vi.fn(), setMe: vi.fn(), invalidateMe: vi.fn() }));

vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ auth: { me: { setData: mocks.setMe, invalidate: mocks.invalidateMe } } }),
  auth: { internalLogin: { useMutation: () => ({ mutate: mocks.login, isPending: false }) }, verifyMfa: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } },
} }));

import { InternalLoginForm } from "./InternalLoginForm";

describe("InternalLoginForm", () => {
  afterEach(() => { cleanup(); mocks.login.mockClear(); });

  it("submits daily employee credentials and preserves a separate owner-login option", () => {
    const ownerLogin = vi.fn();
    render(<InternalLoginForm onOwnerLogin={ownerLogin} />);
    fireEvent.change(screen.getByLabelText("اسم الدخول اليومي"), { target: { value: "accountant.1" } });
    fireEvent.change(screen.getByLabelText("كلمة المرور اليومية"), { target: { value: "A-strong-password-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "دخول الموظف" }));
    expect(mocks.login).toHaveBeenCalledWith({ username: "accountant.1", password: "A-strong-password-2026" });
    fireEvent.click(screen.getByRole("button", { name: "دخول المالك الخارجي" }));
    expect(ownerLogin).toHaveBeenCalledOnce();
  });

  it("shows a visible owner-login transition and prevents duplicate clicks", () => {
    const ownerLogin = vi.fn();
    render(<InternalLoginForm onOwnerLogin={ownerLogin} />);

    const button = screen.getByRole("button", { name: "دخول المالك الخارجي" });
    fireEvent.click(button);

    expect(ownerLogin).toHaveBeenCalledOnce();
    const pendingButton = screen.getByRole("button", { name: "جارٍ فتح تسجيل دخول المالك…" }) as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);
    fireEvent.click(pendingButton);
    expect(ownerLogin).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toContain("يتم نقلك إلى بوابة المالك الآمنة");
  });
});
